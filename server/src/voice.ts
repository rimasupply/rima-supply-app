/**
 * RIMA voice receiver — OpenAI Realtime SIP calls for Anya + Hank.
 *
 * Call path (see voice-wiring-plan.md): Caller -> Twilio number ->
 * Twilio Elastic SIP Trunk -> OpenAI SIP endpoint -> OpenAI Realtime
 * session. OpenAI fires a `realtime.call.incoming` webhook at this app;
 * this module verifies it, accepts the call with the per-number seat
 * config, and holds a sideband WebSocket for the life of the call
 * (transcript capture, tool calls, call-end summary).
 *
 * Hard rules enforced here, not hoped for:
 * - Webhook signature: Standard Webhooks (webhook-id / webhook-timestamp /
 *   webhook-signature, HMAC-SHA256 over `{id}.{timestamp}.{raw body}`).
 *   Fail closed: no OPENAI_WEBHOOK_SECRET configured => every webhook
 *   request is refused. The raw body must reach this handler untouched,
 *   so index.ts mounts express.raw() for this path BEFORE express.json().
 * - Anya never quotes a price: the draft-order tool schema has NO price
 *   field at all, and the catalog endpoint allowlists title/vendor only
 *   (the app catalog DOES carry price/cost — they are stripped by design).
 * - Hank answers ONLY from sheet-lookup tool results: search_sheets is
 *   his only answer tool, and his instructions say a lookup with no
 *   result means take a message, never answer from memory.
 * - No live transfer is attempted: request_forward records the intent;
 *   SIP REFER needs a sip_uri mapping for Nate/store numbers that does
 *   not exist yet (open item — see the trunk spec doc).
 * - Delivery is direct email from Anya's own Zoho mailbox to Randy and
 *   Nate at RIMA Supply (no Gmail anywhere in the path). Every
 *   delivery is ALSO written to a durable outbox file under DATA_DIR, so
 *   nothing is lost when email env is absent; in that case the gap is
 *   logged, never papered over, and no credential is ever invented.
 *
 * Env (names only — values live in the deploy env, never in files):
 *   OPENAI_WEBHOOK_SECRET — webhook signing secret (required, fail closed)
 *   OPENAI_API_KEY        — Realtime accept + sideband auth (required to accept)
 *   SHEETS_API_KEY        — x-sheets-key for the sheets lookup (fail closed when absent)
 *   VOICE_CATALOG_KEY     — x-voice-catalog-key for /api/voice/catalog (mirrors sheets auth)
 *   VOICE_SMTP_HOST / VOICE_SMTP_PORT — Zoho SMTP (defaults smtp.zoho.com:465)
 *   VOICE_SMTP_USER / VOICE_SMTP_PASS — Anya's Zoho mailbox login (optional; outbox otherwise)
 *   VOICE_SMTP_FROM       — From address (defaults to VOICE_SMTP_USER)
 *   VOICE_RANDY_EMAIL / VOICE_NATE_EMAIL — recipients (defaults randyleary@ / nate@ rimasupply.com)
 *   VOICE_SELF_BASE_URL   — override for the internal sheets lookup (default 127.0.0.1:PORT)
 *   SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET — Dev Dashboard app (draft orders)
 *   SHOPIFY_SHOP_DOMAIN — myshopify domain (default aa1ea2-2.myshopify.com)
 *   SHOPIFY_PUBLIC_BASE — public app URL for the OAuth redirect (default Railway URL)
 *   Shopify token: stored server-side in DATA_DIR/shopify-token.json after
 *   OAuth; never logged, never committed, never sent to the model.
 *   DATA_DIR / PORT       — shared with index.ts
 *
 * Seats stay OFF until Randy flips one on; this receiver only answers
 * calls that actually arrive. Nothing here dials, texts, or spends money.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import nodemailer from "nodemailer";
import type { Request, Response } from "express";
import { createShopifyDraft } from "./shopify";
import products from "./products.json";

export const ANYA_NUMBER = "+14013739126";
export const HANK_NUMBER = "+14013365008";
export const NATE_NUMBER = "+14015850904";
export const STORE_NUMBER = "+14016325771";
export const VOICE_MODEL = "gpt-realtime-2.1";

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
const PORT = Number(process.env.PORT ?? 3000);

function dataDir(sub: string): string {
  const dir = join(DATA_DIR, sub);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/* ------------------------------------------------------------------ */
/* Webhook signature verification (Standard Webhooks)                  */
/* ------------------------------------------------------------------ */

export type WebhookHeaders = {
  id?: string;
  timestamp?: string;
  signature?: string;
};

export function verifyOpenAIWebhookSignature(
  rawBody: Buffer,
  headers: WebhookHeaders,
  secret: string,
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  // 5-minute replay window, same as the OpenAI SDKs enforce.
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const keyMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyMaterial, "base64");
    // A secret that is not valid base64 must still be usable raw; the
    // base64 round-trip check keeps both shapes working.
    if (key.length === 0 || key.toString("base64").replace(/=+$/, "") !== keyMaterial.replace(/=+$/, "")) {
      key = Buffer.from(secret, "utf8");
    }
  } catch {
    key = Buffer.from(secret, "utf8");
  }
  const signed = `${headers.id}.${headers.timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", key).update(signed, "utf8").digest("base64");
  for (const part of headers.signature.split(" ")) {
    const candidate = part.startsWith("v1,") ? part.slice(3) : part;
    if (candidate.length !== expected.length) continue;
    try {
      if (timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(expected, "utf8"))) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Seat configs (spec verbatim lines govern)                           */
/* ------------------------------------------------------------------ */

export type Seat = "anya" | "hank";

export function seatForNumber(to: string | undefined | null): Seat | null {
  if (!to) return null;
  const digits = to.replace(/\D/g, "");
  if (digits.endsWith("4013739126")) return "anya";
  if (digits.endsWith("4013365008")) return "hank";
  return null;
}

type ToolDef = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const ANYA_INSTRUCTIONS = [
  "You are Anya, RIMA Supply's digital office assistant, on the phone for RIMA Supply Co, an autobody supply store in Pawtucket, RI.",
  "Greet every caller with exactly: \"Rima Supply, this is Anya, RIMA's digital assistant, how can I help you?\"",
  "You identify as RIMA's digital assistant once, in the greeting. Never claim to be human. If asked directly whether you are human, answer honestly: you are Anya, RIMA's digital assistant, and you can get a human.",
  "NEVER quote a price, a stock level, a discount, or a delivery time. Prices come from Randy or Nate, never from you and never from the catalog. Draft orders have NO price — the draft-order tool has no price field, and you must never speak one.",
  "Orders: ask \"Did you want to place an order?\" Take their information and form a DRAFT order with the capture_draft_order tool (a draft is not a confirmed order; a human confirms). Close every order with exactly: \"I'll have Randy or Nate reach out to you ASAP for a price, thank you so so much for your order, talk to you soon!\" Say nothing else about price, stock, or timing.",
  "Paint orders are Nate's department. Offer: leave him a message or want me to try and connect you? If they say yes, use the request_forward tool with target nate.",
  "Technical or safety questions (TDS, SDS, mixing, how-to) are Hank's department. Say exactly: \"Let me get Hank for you! He's our in-house expert, he has the whole file of SDS and TDS sheets and can get you the answer you need!\" Then use the request_forward tool with target hank. Never answer technical questions yourself.",
  "When a caller asks for a product, use the search_catalog tool to identify it by name and description. Prices are NEVER spoken from the catalog.",
  "If you cannot identify a product, capture a note with the capture_product_note tool (the customer's own words plus their name and number, delivered to the team) and say exactly: \"I don't know what that is yet but I'm leaving a note of it for the guys to figure out for ya.\"",
  "Message-taking: take a message in your own wording and deliver it to exactly the ONE person the caller needs (Randy or Nate) with the take_message tool — never broadcast to both.",
  "Forwards: Hank for technical questions, Nate for paint orders and paint-department matters, Randy's voicemail (store number) only as the forwarding fallback when Nate and Hank cannot be reached. Use the request_forward tool and record the intent; do not read phone numbers out to a caller.",
  "Small talk: answer warmly and naturally from your backstory, keep it short, then turn gently back to what they need. Do not repeat digital reminders after the greeting. Never make up store facts, prices, stock, or promises to fill a chat.",
  "If the caller switches to Spanish, switch to Latin American Spanish (Guatemalan and Dominican register) and back again, without being asked. The same flow applies in Spanish.",
  "No payment details, ever. Do not ask for card numbers or read any back.",
].join("\n");

const HANK_INSTRUCTIONS = [
  "You are Hank, the Tech Hotline digital assistant for RIMA Supply Co, an autobody supply store in Pawtucket, RI.",
  "Greet every caller with exactly: \"Hank at RIMA Supply here, what can I help you with? I'm a digital assistant, but I'm trained on all of our products — shoot a question and I'll do my best to help you.\"",
  "You identify as a digital assistant once, in the greeting. Never claim to be human. If asked directly whether you are human, answer honestly.",
  "Answers come ONLY from the search_sheets tool results. Search the sheet library before answering any product question, and name the product and the sheet type your answer came from. If a sheet does not say it, you do not say it.",
  "If the lookup returns no result, do NOT answer from memory and do NOT guess. Say so, go to the message-taking flow below, and let the team fetch it. A lookup with no result means take a message, never an answer.",
  "Spanish editions are included: if the caller switches to Spanish, answer in Latin American Spanish (Guatemalan and Dominican register) and back again, without being asked.",
  "After answering from a sheet, offer exactly: \"Do you want me to email you the TDS/SDS/MSDS if available?\" If yes, take the caller's email address, read it back to confirm, and use the capture_document_request tool. MSDS requests map to the SDS on file. Never tell the caller the email has already gone out — the team sends it.",
  "When you cannot answer, say exactly: \"Let me take down your name and number so they can get back to you.\" Read the name and number back to confirm. If it is right, say thank you. If it is not, ask the caller to repeat it louder with exactly: \"I'm a little hard of hearing with all the years around those damn DA sanders and air compressors.\" Then use the escalate_to_team tool: the summary goes to Randy AND Nate, who call back ASAP.",
  "NEVER quote a price, a stock level, a discount, or a delivery time. No payment details, ever. Never ask for or store credentials. An email address is the only contact detail taken for a document request.",
].join("\n");

const ANYA_TOOLS: ToolDef[] = [
  {
    type: "function",
    name: "search_catalog",
    description: "Search the RIMA product catalog by name or description to identify a product the caller is asking about. Returns titles and vendors only — never prices.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Product name or description words from the caller." } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "capture_draft_order",
    description: "Capture a DRAFT order. A draft is not a confirmed order; a human confirms and sets the price. There is deliberately no price field on this tool.",
    parameters: {
      type: "object",
      properties: {
        caller_name: { type: "string" },
        callback_phone: { type: "string" },
        shop: { type: "string" },
        email: { type: "string" },
        items: { type: "string", description: "Items and quantities as the caller said them; product code only if the caller gave it." },
        pickup_or_delivery: { type: "string", description: "The caller's preference, not a promise." },
        paint_order: { type: "boolean", description: "True when this is a paint order (routes to Nate)." },
        notes: { type: "string", description: "Colors, urgency, anything unusual." },
      },
      required: ["caller_name", "callback_phone", "items"],
    },
  },
  {
    type: "function",
    name: "take_message",
    description: "Take a message for exactly one person (Randy or Nate) and deliver it to that person only via the Team Thread.",
    parameters: {
      type: "object",
      properties: {
        for_person: { type: "string", enum: ["randy", "nate"] },
        caller_name: { type: "string" },
        callback_phone: { type: "string" },
        message: { type: "string", description: "What they need, in their words." },
      },
      required: ["for_person", "caller_name", "callback_phone", "message"],
    },
  },
  {
    type: "function",
    name: "capture_product_note",
    description: "Capture a note for the team about a product the caller described that could not be identified (customer's words + name/number).",
    parameters: {
      type: "object",
      properties: {
        customer_words: { type: "string" },
        caller_name: { type: "string" },
        callback_phone: { type: "string" },
      },
      required: ["customer_words", "caller_name", "callback_phone"],
    },
  },
  {
    type: "function",
    name: "request_forward",
    description: "Record a forward intent (hank for technical questions, nate for paint orders, voicemail as fallback only). Live transfer is not attempted by this receiver.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", enum: ["hank", "nate", "voicemail"] },
        reason: { type: "string" },
      },
      required: ["target"],
    },
  },
];

const HANK_TOOLS: ToolDef[] = [
  {
    type: "function",
    name: "search_sheets",
    description: "Search the filed TDS/SDS library by product code or description. Answers MUST come from these results; no result means take a message, never answer from memory.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Product code or description words." } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "capture_document_request",
    description: "Capture a caller's request to be emailed a TDS/SDS/MSDS for a product. The team sends the sheet; never tell the caller it already went out.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string" },
        product: { type: "string" },
        sheet_type: { type: "string", description: "TDS, SDS, or MSDS as the caller asked (MSDS maps to the SDS on file)." },
      },
      required: ["email", "product", "sheet_type"],
    },
  },
  {
    type: "function",
    name: "take_message",
    description: "Take a message when a question cannot be answered from a sheet.",
    parameters: {
      type: "object",
      properties: {
        caller_name: { type: "string" },
        callback_phone: { type: "string" },
        question: { type: "string", description: "The question, in the caller's words." },
      },
      required: ["caller_name", "callback_phone", "question"],
    },
  },
  {
    type: "function",
    name: "escalate_to_team",
    description: "Send an escalation summary to Randy AND Nate via the Team Thread when a question cannot be answered.",
    parameters: {
      type: "object",
      properties: {
        caller_name: { type: "string" },
        callback_phone: { type: "string" },
        question: { type: "string" },
        sheets_checked: { type: "string", description: "Sheets looked at, or none." },
        why_unanswerable: { type: "string" },
        urgency: { type: "string" },
        confirmed: { type: "boolean", description: "Whether the name and number were read back and confirmed." },
      },
      required: ["caller_name", "callback_phone", "question", "sheets_checked", "why_unanswerable"],
    },
  },
];

export function buildSessionConfig(seat: Seat): { model: string; instructions: string; tools: ToolDef[]; tool_choice: string } {
  return {
    model: VOICE_MODEL,
    instructions: seat === "anya" ? ANYA_INSTRUCTIONS : HANK_INSTRUCTIONS,
    tools: seat === "anya" ? ANYA_TOOLS : HANK_TOOLS,
    tool_choice: "auto",
  };
}

/* ------------------------------------------------------------------ */
/* Call log (durable, app-local — no external service)                 */
/* ------------------------------------------------------------------ */

function safeCallId(callId: string): string {
  return callId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128) || "unknown";
}

export function logCallEvent(callId: string, event: Record<string, unknown>): void {
  try {
    const dir = dataDir("voice-calls");
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n";
    appendFileSync(join(dir, `${safeCallId(callId)}.jsonl`), line);
  } catch (err) {
    console.error("[voice] call log write failed:", err);
  }
}

/* ------------------------------------------------------------------ */
/* Team delivery: durable outbox + Zoho SMTP from Anya's own mailbox   */
/* (no Gmail anywhere in the path; direct to Randy and Nate)           */
/* ------------------------------------------------------------------ */

export type TeamThreadDelivery = {
  to: string[];
  subject: string;
  body: string;
};

const RANDY_EMAIL = process.env.VOICE_RANDY_EMAIL ?? "randyleary@rimasupply.com";
const NATE_EMAIL = process.env.VOICE_NATE_EMAIL ?? "nate@rimasupply.com";

export async function deliverTeamThread(delivery: TeamThreadDelivery): Promise<{ queued: boolean; emailed: boolean }> {
  // Always queue durably first — the outbox is the record, email is a bonus.
  let queued = false;
  try {
    const dir = dataDir("voice-outbox");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${stamp}-${Math.random().toString(36).slice(2, 8)}.json`;
    writeFileSync(join(dir, name), JSON.stringify({ ...delivery, queued_at: new Date().toISOString() }, null, 2));
    queued = true;
  } catch (err) {
    console.error("[voice] outbox write failed:", err);
  }
  console.log(`[voice] team email queued: ${delivery.subject}`);

  const host = process.env.VOICE_SMTP_HOST ?? "smtp.zoho.com";
  const port = Number(process.env.VOICE_SMTP_PORT ?? 465);
  const user = process.env.VOICE_SMTP_USER ?? "";
  const pass = process.env.VOICE_SMTP_PASS ?? "";
  const from = process.env.VOICE_SMTP_FROM ?? user;
  if (!user || !pass || !from) {
    console.log("[voice] SMTP env not configured — delivery stays in the outbox (gap: set VOICE_SMTP_USER, VOICE_SMTP_PASS, VOICE_SMTP_FROM).");
    return { queued, emailed: false };
  }
  const to = delivery.to.length > 0 ? delivery.to : [RANDY_EMAIL, NATE_EMAIL];
  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.sendMail({ from, to: to.join(", "), subject: delivery.subject, text: delivery.body });
    console.log(`[voice] team email sent: ${delivery.subject}`);
    return { queued, emailed: true };
  } catch (err) {
    console.error(`[voice] SMTP send failed; message remains in the outbox:`, err);
    return { queued, emailed: false };
  }
}

/* ------------------------------------------------------------------ */
/* Catalog search — allowlist only, prices stripped by design         */
/* ------------------------------------------------------------------ */

type CatalogProduct = {
  title?: string;
  vendor?: string;
  status?: string;
  [key: string]: unknown;
};

const CATALOG: CatalogProduct[] = products as CatalogProduct[];

export function searchCatalog(q: string): { title: string; vendor: string }[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const results: { title: string; vendor: string }[] = [];
  for (const p of CATALOG) {
    if (p.status && p.status !== "active") continue;
    const hay = `${p.title ?? ""} ${p.vendor ?? ""}`.toLowerCase();
    if (!hay.includes(needle)) continue;
    // Allowlist: title + vendor ONLY. price, cost, qty, barcode and every
    // other catalog field are never returned, even though they exist.
    results.push({ title: String(p.title ?? ""), vendor: String(p.vendor ?? "") });
    if (results.length >= 10) break;
  }
  return results;
}

export function voiceCatalogHandler(req: Request, res: Response): void {
  const key = process.env.VOICE_CATALOG_KEY ?? "";
  if (process.env.NODE_ENV === "production" && !key) {
    res.status(503).json({ ok: false, error: "Voice catalog not configured." });
    return;
  }
  if (key && req.header("x-voice-catalog-key") !== key) {
    res.status(401).json({ ok: false, error: "Unauthorized." });
    return;
  }
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ ok: false, error: "Missing query." });
    return;
  }
  res.json({ ok: true, results: searchCatalog(q) });
}

/* ------------------------------------------------------------------ */
/* Hank sheet lookup — server-side call to /api/sheets/search          */
/* ------------------------------------------------------------------ */

export type SheetLookupResult =
  | { ok: true; results: { code: string; type: string; name: string; file: string; snippet: string }[] }
  | { ok: false; unavailable: true; reason: string };

export async function lookupSheets(query: string): Promise<SheetLookupResult> {
  const key = process.env.SHEETS_API_KEY ?? "";
  if (!key) {
    // Fail closed: no key means no lookup, which means Hank takes a
    // message instead of answering — never an ungrounded answer.
    return { ok: false, unavailable: true, reason: "Sheets lookup not configured." };
  }
  const base = process.env.VOICE_SELF_BASE_URL ?? `http://127.0.0.1:${PORT}`;
  try {
    const res = await fetch(`${base}/api/sheets/search?q=${encodeURIComponent(query)}`, {
      headers: { "x-sheets-key": key },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, unavailable: true, reason: `Sheets search returned ${res.status}.` };
    const data = (await res.json()) as { ok?: boolean; results?: SheetLookupResult extends { ok: true; results: infer R } ? R : never };
    if (!data.ok || !Array.isArray(data.results)) return { ok: false, unavailable: true, reason: "Sheets search gave no usable result." };
    return { ok: true, results: data.results };
  } catch (err) {
    console.error("[voice] sheets lookup error:", err);
    return { ok: false, unavailable: true, reason: "Sheets search unreachable." };
  }
}

/* ------------------------------------------------------------------ */
/* Tool dispatch (sideband function calls)                             */
/* ------------------------------------------------------------------ */

async function dispatchTool(seat: Seat, callId: string, name: string, args: Record<string, unknown>): Promise<string> {
  const s = (v: unknown) => String(v ?? "");
  logCallEvent(callId, { type: "tool_call", seat, tool: name, args });
  switch (name) {
    case "search_catalog": {
      const results = searchCatalog(s(args.query));
      return JSON.stringify({ results });
    }
    case "search_sheets": {
      const r = await lookupSheets(s(args.query));
      if (!r.ok) {
        // No lookup result => the session must take a message, not answer.
        return JSON.stringify({ unavailable: true, reason: r.reason, instruction: "No sheet result. Do not answer from memory — take a message instead." });
      }
      if (r.results.length === 0) {
        return JSON.stringify({ results: [], instruction: "No sheet covers this. Do not answer from memory — take a message instead." });
      }
      return JSON.stringify({ results: r.results });
    }
    case "capture_draft_order": {
      const paint = args.paint_order === true;
      const body = [
        "DRAFT ORDER - NOT CONFIRMED",
        `Caller: ${s(args.caller_name)}`,
        `Shop: ${s(args.shop)}`,
        `Callback phone: ${s(args.callback_phone)}`,
        `Email: ${s(args.email)}`,
        `Items and quantities (as the caller said them): ${s(args.items)}`,
        `Pickup or delivery (caller's preference, not a promise): ${s(args.pickup_or_delivery)}`,
        `Paint order? ${paint ? "yes - route to Nate" : "no"}`,
        `Notes: ${s(args.notes)}`,
        "Price quoted: NONE (never)",
        "Next step: Randy or Nate to call back for a price",
        "Status: DRAFT, awaiting a human",
      ].join("\n");
      // Shopify draft beside the email. A failed draft never fails the
      // call: the email + outbox still carry the order. The model-facing
      // return carries no URL or draft id, so nothing leaks into speech.
      let emailBody = body;
      try {
        const draft = await createShopifyDraft({
          callerName: s(args.caller_name),
          callbackPhone: s(args.callback_phone),
          shop: s(args.shop),
          email: s(args.email),
          itemsText: s(args.items),
          pickupOrDelivery: s(args.pickup_or_delivery),
          paintOrder: paint,
          notes: s(args.notes),
        });
        emailBody += draft.ok
          ? `\nShopify draft: ${draft.name} — ${draft.adminUrl}`
          : `\nShopify draft: NOT created (${draft.reason})`;
        await deliverTeamThread({ to: [], subject: `DRAFT ORDER - ${s(args.caller_name)}`, body: emailBody });
        return JSON.stringify({ captured: true, price: "NONE", shopify_draft: draft.ok ? "created" : "not_created" });
      } catch (err) {
        console.error("[voice] Shopify draft failed:", err instanceof Error ? err.message : "unknown");
        emailBody += "\nShopify draft: NOT created (error — see server log)";
        await deliverTeamThread({ to: [], subject: `DRAFT ORDER - ${s(args.caller_name)}`, body: emailBody });
        return JSON.stringify({ captured: true, price: "NONE", shopify_draft: "not_created" });
      }
    }
    case "take_message": {
      const forPerson = seat === "anya" ? s(args.for_person) : "team";
      // Anya messages go to exactly the ONE person the caller needs; Hank
      // messages and anything else go to both.
      const to = forPerson === "nate" ? [NATE_EMAIL] : forPerson === "randy" ? [RANDY_EMAIL] : [];
      const body = [
        `MESSAGE FOR: ${seat === "anya" ? forPerson : "Randy and Nate (Hank message)"}`,
        `Caller: ${s(args.caller_name)}`,
        `Callback phone: ${s(args.callback_phone)}`,
        `What they need (their words): ${s(args.message ?? args.question)}`,
        `Taken by: ${seat === "anya" ? "Anya" : "Hank"} (digital assistant)`,
      ].join("\n");
      await deliverTeamThread({ to, subject: `MESSAGE FOR ${seat === "anya" ? forPerson.toUpperCase() : "RANDY AND NATE"} - ${s(args.caller_name)}`, body });
      return JSON.stringify({ captured: true });
    }
    case "capture_product_note": {
      const body = [
        "PRODUCT NOTE - COULD NOT IDENTIFY",
        `Customer's words: ${s(args.customer_words)}`,
        `Caller: ${s(args.caller_name)}`,
        `Callback phone: ${s(args.callback_phone)}`,
        "Taken by: Anya (digital assistant)",
      ].join("\n");
      await deliverTeamThread({ to: [], subject: `PRODUCT NOTE - ${s(args.caller_name)}`, body });
      return JSON.stringify({ captured: true });
    }
    case "capture_document_request": {
      const body = [
        "DOCUMENT REQUEST - TEAM TO SEND",
        `Caller email: ${s(args.email)}`,
        `Product: ${s(args.product)}`,
        `Sheet type asked for: ${s(args.sheet_type)} (MSDS maps to the SDS on file)`,
        "Note: the caller was NOT told the email already went out; the team sends the sheet from the library.",
      ].join("\n");
      await deliverTeamThread({ to: [], subject: `DOCUMENT REQUEST - ${s(args.product)}`, body });
      return JSON.stringify({ captured: true, note: "Team sends the sheet; do not tell the caller it already went out." });
    }
    case "escalate_to_team": {
      const body = [
        "HANK ESCALATION",
        `Caller: ${s(args.caller_name)}`,
        `Callback phone (read back and confirmed: ${args.confirmed === true ? "yes" : "no"}): ${s(args.callback_phone)}`,
        `Question (their words): ${s(args.question)}`,
        `What I checked (sheets looked at, or none): ${s(args.sheets_checked)}`,
        `Why I could not answer: ${s(args.why_unanswerable)}`,
        `Urgency the caller stated: ${s(args.urgency)}`,
        "Sent to: Randy AND Nate",
      ].join("\n");
      await deliverTeamThread({ to: [], subject: `HANK ESCALATION - ${s(args.caller_name)}`, body });
      return JSON.stringify({ captured: true });
    }
    case "request_forward": {
      // Recorded only. Live SIP REFER needs a sip_uri for the target
      // number, which does not exist yet — the session tells the caller
      // the forward path and the team follows up from this record.
      logCallEvent(callId, { type: "forward_intent", seat, target: s(args.target), reason: s(args.reason) });
      return JSON.stringify({ recorded: true, target: s(args.target), note: "Forward intent recorded; live transfer is not wired yet." });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

/* ------------------------------------------------------------------ */
/* Sideband WebSocket (Bun built-in client)                            */
/* ------------------------------------------------------------------ */

const SEAT_GREETING: Record<string, string> = {
  anya: "Rima Supply, this is Anya, RIMA's digital assistant, how can I help you?",
  hank: "Hank at RIMA Supply here, what can I help you with? I'm a digital assistant, but I'm trained on all of our products — shoot a question and I'll do my best to help you.",
};

function openSideband(callId: string, seat: Seat, apiKey: string, config: { instructions: string; tools: ToolDef[]; tool_choice: string }): void {
  const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`;
  const greeting = SEAT_GREETING[seat] ?? "";
  // Twilio's official guide for this exact stack sends an Origin header and
  // retries the attach on 404/1006: the attach can race session creation,
  // and a single failed attempt used to leave the call with no control
  // channel and no greeting.
  const maxAttempts = 6;
  const delaysMs = [0, 1000, 2000, 4000, 8000];
  let attempt = 0;
  let opened = false;
  let retryPending = false;
  const scheduleRetry = (): void => {
    if (opened || retryPending) return;
    if (attempt >= maxAttempts) {
      console.error(`[voice] sideband gave up for call ${callId} after ${attempt} attempts`);
      logCallEvent(callId, { type: "sideband_gave_up", seat, attempts: attempt });
      return;
    }
    retryPending = true;
    const delay = delaysMs[Math.min(attempt, delaysMs.length - 1)];
    setTimeout(() => { retryPending = false; connect(); }, delay);
  };
  const connect = (): void => {
    attempt += 1;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}`, origin: "https://api.openai.com" } } as never);
    } catch (err) {
      console.error(`[voice] sideband open failed (attempt ${attempt}):`, err);
      logCallEvent(callId, { type: "sideband_error", seat, attempt, error: String(err) });
      scheduleRetry();
      return;
    }
    ws.addEventListener("open", () => {
      opened = true;
      console.log(`[voice] sideband open for call ${callId} (${seat}, attempt ${attempt})`);
      logCallEvent(callId, { type: "sideband_open", seat, attempt });
      // Tools live on the session, not in the accept payload: the SIP
      // accept endpoint has answered 200 to overloaded payloads and then
      // left the sideband unable to find the call (404), so configure
      // tools here, then greet. The greeting needs no tools, so sending
      // both in order is safe even if the update lands a beat later.
      try {
        ws.send(JSON.stringify({ type: "session.update", session: { instructions: config.instructions, tools: config.tools, tool_choice: config.tool_choice } }));
        ws.send(JSON.stringify({ type: "response.create", response: { instructions: `Say to the caller: ${greeting}` } }));
      } catch (err) {
        console.error("[voice] session update / greeting send failed:", err);
      }
    });
    ws.addEventListener("message", (ev) => {
      void (async () => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String((ev as MessageEvent).data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(data.type ?? "");
        if (type === "response.function_call_arguments.done") {
          const callIdArg = String(data.call_id ?? "");
          const fnName = String(data.name ?? "");
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(String(data.arguments ?? "{}")) as Record<string, unknown>;
          } catch {
            fnArgs = {};
          }
          const output = await dispatchTool(seat, callId, fnName, fnArgs);
          try {
            ws.send(JSON.stringify({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: callIdArg, output },
            }));
            ws.send(JSON.stringify({ type: "response.create" }));
          } catch (err) {
            console.error("[voice] sideband send failed:", err);
          }
          return;
        }
        // Transcript capture: keep the text-bearing events, drop the rest.
        if (type.includes("transcript") || type === "response.output_text.done" || type === "conversation.item.created") {
          logCallEvent(callId, { type: "session_event", seat, event_type: type, item: data.item ?? null, text: data.text ?? data.transcript ?? null });
        }
        if (type === "realtime.call.ended" || type === "session.ended") {
          logCallEvent(callId, { type: "call_end", seat, event_type: type });
          try { ws.close(); } catch { /* already closed */ }
        }
      })();
    });
    ws.addEventListener("close", () => {
      if (opened) {
        console.log(`[voice] sideband closed for call ${callId} (${seat})`);
        logCallEvent(callId, { type: "call_end", seat, reason: "sideband_closed" });
      } else {
        scheduleRetry();
      }
    });
    ws.addEventListener("error", (ev) => {
      console.error(`[voice] sideband error for call ${callId}:`, ev);
      logCallEvent(callId, { type: "sideband_error", seat, attempt });
      if (!opened) scheduleRetry();
    });
  };
  connect();
}

/* ------------------------------------------------------------------ */
/* Webhook handler                                                     */
/* ------------------------------------------------------------------ */

const seenWebhookIds = new Set<string>();

const SEAT_SUFFIXES = ["4013739126", "4013365008"];

function extractToNumber(data: Record<string, unknown>): string | null {
  // Gather every string the event offers about the destination: top-level
  // fields, the sip object, sip headers (any key casing), and a nested call
  // object. Trunked calls arrive via sip:<project>@sip.api.openai.com, so the
  // dialed PSTN number is often NOT in `to` at all — it may hide in a header
  // or be absent entirely (the handler falls back to Anya below).
  const strings: string[] = [];
  const pushStr = (v: unknown): void => { if (typeof v === "string" && v) strings.push(v); };
  const pushObjStrings = (o: unknown): void => {
    if (o && typeof o === "object" && !Array.isArray(o)) {
      for (const v of Object.values(o as Record<string, unknown>)) pushStr(v);
    }
  };
  for (const k of ["to", "to_number", "phone_number", "destination", "called_number", "dialed_number"]) pushStr(data[k]);
  pushObjStrings(data.sip);
  pushObjStrings(data.sip_headers);
  pushObjStrings(data.call);
  // A seat number anywhere in the event wins. The caller number can never
  // match a seat suffix, so this cannot misroute a caller to the wrong seat.
  for (const s of strings) {
    const d = s.replace(/\D/g, "");
    if (d && SEAT_SUFFIXES.some((suf) => d.endsWith(suf))) return s;
  }
  // Legacy fallback: first plausible +1 number, for older event shapes.
  for (const s of strings) {
    const m = s.match(/(\+?1?\d{10,11})/);
    if (m) return m[1];
  }
  return null;
}

export async function voiceWebhookHandler(req: Request, res: Response): Promise<void> {
  // Fail closed: no signing secret configured => refuse everything.
  const secret = process.env.OPENAI_WEBHOOK_SECRET ?? "";
  if (!secret) {
    res.status(503).json({ ok: false, error: "Voice webhook not configured." });
    return;
  }
  const raw = req.body as unknown;
  if (!Buffer.isBuffer(raw)) {
    res.status(400).json({ ok: false, error: "Raw body required." });
    return;
  }
  const verified = verifyOpenAIWebhookSignature(raw, {
    id: req.header("webhook-id"),
    timestamp: req.header("webhook-timestamp"),
    signature: req.header("webhook-signature"),
  }, secret);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Invalid webhook signature." });
    return;
  }
  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw.toString("utf8")) as { type?: string; data?: Record<string, unknown> };
  } catch {
    res.status(400).json({ ok: false, error: "Invalid JSON." });
    return;
  }
  // Dedupe retries on the webhook id — an accept must happen once.
  const webhookId = req.header("webhook-id") ?? "";
  if (webhookId) {
    if (seenWebhookIds.has(webhookId)) {
      res.json({ ok: true, duplicate: true });
      return;
    }
    seenWebhookIds.add(webhookId);
    if (seenWebhookIds.size > 1000) {
      const first = seenWebhookIds.values().next().value;
      if (first) seenWebhookIds.delete(first);
    }
  }
  const type = event.type ?? "";
  if (type !== "realtime.call.incoming" && type !== "live.transport.incoming" && type !== "live.call.incoming") {
    res.json({ ok: true, ignored: true, type });
    return;
  }
  const data = event.data ?? {};
  const callId = String(data.call_id ?? data.session_id ?? "");
  if (!callId) {
    res.status(400).json({ ok: false, error: "No call id in event." });
    return;
  }
  const to = extractToNumber(data);
  let seat = seatForNumber(to);
  if (!seat) {
    // TEMPORARY fallback (Oct 28): trunked SIP calls report the project URI
    // as To, not the dialed number, so the destination is often unresolvable.
    // Anya is the only live seat, so an unresolvable call on this webhook can
    // only be a test or wrong-number call to her line. Log loudly and REMOVE
    // before Hank goes live, when routing must use the dialed number.
    const debug = JSON.stringify({ to: data.to, sip: data.sip, sip_headers: data.sip_headers }).slice(0, 500);
    console.log(`[voice] incoming call ${callId} to unresolvable destination (to=${to ?? "none"}); falling back to Anya (TEMPORARY). Event: ${debug}`);
    logCallEvent(callId, { type: "routing_fallback_anya", to: to ?? null, debug });
    seat = "anya";
  }
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    // Fail closed: without an API key we cannot accept, so say so plainly
    // instead of leaving the caller hanging on an unaccepted call.
    res.status(503).json({ ok: false, error: "Voice accept not configured." });
    return;
  }
  const config = buildSessionConfig(seat);
  try {
    // Accept stays minimal and guide-shaped: the GA Realtime API removed
    // the OpenAI-Beta: realtime=v1 header (May 2026), and overloaded
    // accept payloads have answered 200 while leaving the sideband
    // unable to find the call (404). Tools are configured on the
    // sideband via session.update once it opens, not here.
    const acceptRes = await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "realtime", model: config.model, instructions: config.instructions }),
      signal: AbortSignal.timeout(10000),
    });
    if (!acceptRes.ok) {
      console.error(`[voice] accept failed for call ${callId} (${acceptRes.status})`);
      logCallEvent(callId, { type: "accept_failed", seat, status: acceptRes.status });
      res.status(502).json({ ok: false, error: "Call accept failed." });
      return;
    }
    const acceptBody = await acceptRes.text().catch(() => "");
    console.log(`[voice] accept response for call ${callId}: ${acceptRes.status} ${acceptBody.slice(0, 300)}`);
  } catch (err) {
    console.error(`[voice] accept error for call ${callId}:`, err);
    res.status(502).json({ ok: false, error: "Call accept failed." });
    return;
  }
  console.log(`[voice] call ${callId} accepted for ${seat} (to ${to})`);
  logCallEvent(callId, { type: "call_accepted", seat, to, webhook_event: type });
  // Sideband is fire-and-forget: the call is live once we answer 200,
  // and a slow socket open must not hold the webhook response up.
  openSideband(callId, seat, apiKey, config);
  // Twilio's official guide for this stack sets an Authorization header on
  // the webhook response; match it.
  res.set("Authorization", `Bearer ${apiKey}`);
  res.json({ ok: true, call_id: callId, seat });
}
