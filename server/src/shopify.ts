/**
 * Shopify OAuth + draft orders for Anya's voice drafts.
 *
 * Why OAuth instead of a pasted token: Shopify's Dev Dashboard no longer
 * reveals a long-lived Admin API token in any UI, and the legacy
 * store-admin reveal is disabled for this store. The supported path is
 * the OAuth authorization-code exchange: the store owner approves the
 * app, Shopify redirects here with a code, and this module trades the
 * code for a permanent offline token that lives ONLY in a server-side
 * file under DATA_DIR (durable on Railway via the /data volume).
 *
 * Hard rules enforced here, not hoped for:
 * - The token is never logged, never returned by any endpoint, never
 *   committed to git (see .gitignore), and never sent to the model.
 * - The callback verifies state + HMAC + shop + timestamp before ANY
 *   exchange happens. A failed check stores nothing.
 * - Drafts are draft-only: this module calls draftOrderCreate and never
 *   draftOrderComplete, never charges, never invoices.
 * - Anya never prices: line items carry NO price override, so Shopify
 *   applies the variant's stored selling price. Paint orders create a
 *   note-only draft (no lines) — paint pricing stays with Randy/Nate.
 * - Anything that cannot be matched to a variant goes in the draft
 *   note, never guessed onto a line. A failed draft never fails the
 *   call: the email + outbox still carry the order.
 *
 * Env (names only — values live in the deploy env, never in files):
 *   SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET — Dev Dashboard app
 *   SHOPIFY_SHOP_DOMAIN — myshopify domain (default aa1ea2-2.myshopify.com)
 *   SHOPIFY_API_VERSION — Admin API version (default 2025-01)
 *   SHOPIFY_PUBLIC_BASE — public app URL for the OAuth redirect
 *   DATA_DIR — shared with index.ts / voice.ts
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Request, Response } from "express";

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN ?? "aa1ea2-2.myshopify.com";
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-01";
const PUBLIC_BASE =
  process.env.SHOPIFY_PUBLIC_BASE ?? "https://rima-supply-app-production.up.railway.app";
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET ?? "";
const SCOPES = "write_draft_orders,read_orders,read_products";

const TOKEN_PATH = join(DATA_DIR, "shopify-token.json");
const STATE_PATH = join(DATA_DIR, "oauth-state.json");
const STATE_TTL_MS = 10 * 60 * 1000;

/** Fetch with a hard timeout: a stalled upstream must fail loudly, never
 *  hang an order capture silently while the caller is still on the line. */
async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

type StoredToken = { shop: string; access_token: string; scope: string; obtained_at: string };

function readToken(): StoredToken | null {
  try {
    if (!existsSync(TOKEN_PATH)) return null;
    const parsed = JSON.parse(readFileSync(TOKEN_PATH, "utf8")) as StoredToken;
    if (!parsed || typeof parsed.access_token !== "string" || parsed.access_token.length < 10) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Connection status for logs and health checks. Never includes the token. */
export function shopifyStatus(): { connected: boolean; shop: string } {
  const token = readToken();
  return { connected: token !== null, shop: SHOP_DOMAIN };
}

/* ------------------------------------------------------------------ */
/* OAuth install + callback                                           */
/* ------------------------------------------------------------------ */

export function shopifyInstallHandler(req: Request, res: Response): void {
  if (!CLIENT_ID) {
    res.status(503).send("Shopify is not configured yet (client id missing).");
    return;
  }
  const state = randomBytes(16).toString("hex");
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify({ state, createdAt: Date.now() }), { mode: 0o600 });
  const redirectUri = `${PUBLIC_BASE}/oauth/shopify/callback`;
  const authorize = new URL(`https://${SHOP_DOMAIN}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", CLIENT_ID);
  authorize.searchParams.set("scope", SCOPES);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  res.redirect(authorize.toString());
}

function verifyShopifyHmac(query: Record<string, string>, secret: string): boolean {
  const provided = query.hmac ?? "";
  if (!provided || !secret) return false;
  const message = Object.keys(query)
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message, "utf8").digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export async function shopifyCallbackHandler(req: Request, res: Response): Promise<void> {
  const fail = (msg: string): void => {
    console.log(`[shopify] OAuth callback refused: ${msg}`);
    res.status(400).send("Shopify connection failed. Nothing was stored. Try the install link again.");
  };
  const query = req.query as Record<string, string>;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(503).send("Shopify is not configured yet.");
    return;
  }
  if (!query.code || !query.shop || !query.state || !query.hmac) {
    fail("missing params");
    return;
  }
  if (query.shop !== SHOP_DOMAIN) {
    fail("shop mismatch");
    return;
  }
  // State: must match the pending install and be fresh; consumed once.
  let pending: { state: string; createdAt: number } | null = null;
  try {
    pending = JSON.parse(readFileSync(STATE_PATH, "utf8")) as { state: string; createdAt: number };
  } catch {
    pending = null;
  }
  try {
    unlinkSync(STATE_PATH);
  } catch {
    /* already gone */
  }
  if (!pending || pending.state !== query.state || Date.now() - pending.createdAt > STATE_TTL_MS) {
    fail("bad or expired state");
    return;
  }
  if (!verifyShopifyHmac(query, CLIENT_SECRET)) {
    fail("hmac mismatch");
    return;
  }
  // Exchange the code for a permanent offline token. The code and the
  // token are never logged.
  try {
    const resp = await fetchWithTimeout(`https://${SHOP_DOMAIN}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: query.code }),
    });
    if (!resp.ok) {
      console.log(`[shopify] Token exchange failed: HTTP ${resp.status}`);
      res.status(502).send("Shopify connection failed at the token exchange. Nothing was stored.");
      return;
    }
    const data = (await resp.json()) as { access_token?: string; scope?: string };
    if (!data.access_token) {
      console.log("[shopify] Token exchange returned no token");
      res.status(502).send("Shopify connection failed at the token exchange. Nothing was stored.");
      return;
    }
    mkdirSync(DATA_DIR, { recursive: true });
    const stored: StoredToken = {
      shop: SHOP_DOMAIN,
      access_token: data.access_token,
      scope: data.scope ?? SCOPES,
      obtained_at: new Date().toISOString(),
    };
    writeFileSync(TOKEN_PATH, JSON.stringify(stored), { mode: 0o600 });
    console.log(`[shopify] Connected to ${SHOP_DOMAIN} (scopes: ${stored.scope})`);
    res.send(
      `<!doctype html><html><body><h1>RIMA Supply voice app connected to ${SHOP_DOMAIN}</h1>` +
        `<p>Draft orders are now enabled. No credentials are shown on this page.</p></body></html>`,
    );
  } catch (err) {
    console.log(`[shopify] Token exchange error: ${err instanceof Error ? err.message : "unknown"}`);
    res.status(502).send("Shopify connection failed at the token exchange. Nothing was stored.");
  }
}

/* ------------------------------------------------------------------ */
/* Admin API helpers (token never logged)                             */
/* ------------------------------------------------------------------ */

async function shopifyGraphQL<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const resp = await fetchWithTimeout(`https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`Shopify API HTTP ${resp.status}`);
  const data = (await resp.json()) as { data?: T; errors?: { message: string }[] };
  if (data.errors && data.errors.length > 0) throw new Error(data.errors[0].message);
  if (!data.data) throw new Error("empty Shopify response");
  return data.data;
}

type VariantHit = { variantId: string; title: string; variantTitle: string };

async function resolveVariant(token: string, segment: string): Promise<VariantHit | null> {
  // Prefer code-like tokens (letters + digits, e.g. UP2253, FPR-9450);
  // fall back to the longest word in the segment.
  const codeTokens = (segment.match(/[A-Za-z]{2,}[\w-]*\d[\w-]*/g) ?? [])
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length >= 4);
  const words = segment.split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 3);
  const candidates: string[] = [];
  for (const t of codeTokens.slice(0, 2)) {
    candidates.push(t);
    const compact = t.replace(/-/g, "");
    if (compact !== t) candidates.push(compact);
  }
  if (candidates.length === 0 && words.length > 0) {
    candidates.push(words.sort((a, b) => b.length - a.length)[0]);
  }
  const productQuery = `
    query FindProduct($q: String!) {
      products(first: 5, query: $q) {
        edges { node { title variants(first: 1) { edges { node { id title } } } } }
      }
    }`;
  for (const cand of candidates.slice(0, 3)) {
    const q = `sku:${cand} OR title:*${cand}* OR barcode:${cand}`;
    try {
      const data = await shopifyGraphQL<{
        products: { edges: { node: { title: string; variants: { edges: { node: { id: string; title: string } }[] } } }[] };
      }>(token, productQuery, { q });
      const first = data.products.edges[0];
      const variant = first?.node.variants.edges[0]?.node;
      if (first && variant) {
        return { variantId: variant.id, title: first.node.title, variantTitle: variant.title };
      }
    } catch (err) {
      console.log(`[shopify] Variant lookup failed for "${cand}": ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
  return null;
}

function parseQuantity(segment: string): number {
  const m =
    segment.match(/^\s*(\d+)\s*[x×]\b/i) ??
    segment.match(/\b[x×]\s*(\d+)\s*$/i) ??
    segment.match(/\bqty\s*(\d+)/i) ??
    segment.match(/\b(\d+)\s+(each|ea|pack|case|box|roll|gal|gallon)\b/i);
  const n = m ? Number(m[1]) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 999);
}

/* ------------------------------------------------------------------ */
/* Draft creation                                                     */
/* ------------------------------------------------------------------ */

export type DraftOrderInput = {
  callerName: string;
  callbackPhone: string;
  shop: string;
  email: string;
  itemsText: string;
  pickupOrDelivery: string;
  paintOrder: boolean;
  notes: string;
};

export type DraftResult =
  | { ok: true; name: string; adminUrl: string; matched: number; unmatched: number }
  | { ok: false; reason: string };

export async function createShopifyDraft(input: DraftOrderInput): Promise<DraftResult> {
  const token = readToken();
  if (!token) return { ok: false, reason: "shopify_not_connected" };
  const shopHandle = SHOP_DOMAIN.split(".")[0];

  const noteLines = [
    "Voice draft — captured by Anya (digital assistant). NOT confirmed.",
    `Caller: ${input.callerName}`,
    `Shop: ${input.shop}`,
    `Callback phone: ${input.callbackPhone}`,
    `Email: ${input.email}`,
    `Pickup or delivery (caller's preference, not a promise): ${input.pickupOrDelivery}`,
    `Paint order? ${input.paintOrder ? "yes - route to Nate" : "no"}`,
    `Notes: ${input.notes}`,
    "Price quoted: NONE — Randy or Nate to confirm",
  ];

  // Paint orders: note-only draft. Paint pricing stays with Randy/Nate.
  let lineItems: { variantId: string; quantity: number }[] = [];
  let matched = 0;
  let unmatched = 0;
  if (input.paintOrder) {
    noteLines.push(`Paint details (in notes per shop rule): ${input.itemsText}`);
  } else {
    const segments = input.itemsText
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    const matchedLines: string[] = [];
    const unmatchedLines: string[] = [];
    for (const segment of segments) {
      const hit = await resolveVariant(token.access_token, segment);
      if (hit) {
        lineItems.push({ variantId: hit.variantId, quantity: parseQuantity(segment) });
        matched += 1;
        matchedLines.push(`${parseQuantity(segment)} x ${hit.title}${hit.variantTitle !== "Default Title" ? ` (${hit.variantTitle})` : ""} — caller said: "${segment}"`);
      } else {
        unmatched += 1;
        unmatchedLines.push(segment);
      }
    }
    if (matchedLines.length > 0) noteLines.push("Matched lines:", ...matchedLines);
    if (unmatchedLines.length > 0) {
      noteLines.push("Unmatched items (in this note, NOT on lines — team to identify):", ...unmatchedLines);
    }
    if (segments.length === 0) noteLines.push(`Items (as the caller said them): ${input.itemsText}`);
  }

  const mutation = `
    mutation DraftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name }
        userErrors { field message }
      }
    }`;
  const draftInput: Record<string, unknown> = {
    note: noteLines.join("\n"),
    tags: ["voice-draft"],
    lineItems,
  };
  if (input.email) draftInput.email = input.email;
  try {
    const data = await shopifyGraphQL<{
      draftOrderCreate: {
        draftOrder: { id: string; name: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    }>(token.access_token, mutation, { input: draftInput });
    const created = data.draftOrderCreate.draftOrder;
    const errors = data.draftOrderCreate.userErrors;
    if (!created) {
      throw new Error(errors.length > 0 ? errors[0].message : "draft not created");
    }
    const numericId = created.id.split("/").pop() ?? "";
    const adminUrl = `https://admin.shopify.com/store/${shopHandle}/draft_orders/${numericId}`;
    console.log(`[shopify] Draft created: ${created.name} (${matched} matched, ${unmatched} unmatched)`);
    return { ok: true, name: created.name, adminUrl, matched, unmatched };
  } catch (err) {
    console.log(`[shopify] Draft create failed: ${err instanceof Error ? err.message : "unknown"}`);
    return { ok: false, reason: "draft_create_failed" };
  }
}
