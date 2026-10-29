/**
 * RIMA Supply — standalone server.
 *
 * Express + Drizzle (bun:sqlite) + express-session.
 * Single action-dispatch endpoint: POST /api/action { action, args }.
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import express from "express";
import session from "express-session";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as schema from "./schema";
import { Actions } from "./actions";
import { authActions, ensureSeedAdmin, isActionAllowed } from "./auth";
import { blobPathForKey, createBlobs } from "./blobs";
import { runMigrations } from "./migrate";
import { sheetsSearchHandler } from "./sheets";
import { voiceCatalogHandler, voiceWebhookHandler } from "./voice";
import { shopifyCallbackHandler, shopifyInstallHandler } from "./shopify";
import { setRestoreContext } from "./restore";
import { anthropicComplete, wrapDb, type AuthUser, type Ctx, type Db } from "./sdk-compat";

declare module "express-session" {
  interface SessionData {
    user?: AuthUser;
  }
}

/** SQLite-backed session store so logins survive server restarts/redeploys. */
class SqliteSessionStore extends session.Store {
  constructor(private sqlite: Database) {
    super();
    sqlite.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    )`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires)`);
  }
  get(sid: string, cb: (err: unknown, sess?: session.SessionData | null) => void) {
    try {
      const row = this.sqlite.query(`SELECT sess, expires FROM sessions WHERE sid = ?`).get(sid) as { sess: string; expires: number } | null;
      if (!row || row.expires < Date.now()) {
        if (row) this.sqlite.query(`DELETE FROM sessions WHERE sid = ?`).run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.sess));
    } catch (err) { cb(err); }
  }
  set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 14 * 24 * 60 * 60 * 1000;
      this.sqlite.query(`INSERT OR REPLACE INTO sessions (sid, sess, expires) VALUES (?, ?, ?)`).run(sid, JSON.stringify(sess), expires);
      cb?.();
    } catch (err) { cb?.(err); }
  }
  destroy(sid: string, cb?: (err?: unknown) => void) {
    try {
      this.sqlite.query(`DELETE FROM sessions WHERE sid = ?`).run(sid);
      cb?.();
    } catch (err) { cb?.(err); }
  }
  touch(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void) {
    this.set(sid, sess, cb);
  }
}

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, "app.db");
const SESSION_SECRET = process.env.SESSION_SECRET ?? "rima-dev-secret-change-me";
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

mkdirSync(DATA_DIR, { recursive: true });

// Seed the database on first boot: if DATA_DIR/app.db doesn't exist, copy
// the bundled seed database (shipped in the Docker image at ./data/app.db).
const SEED_DB = join(process.cwd(), "data", "app.db");
if (!existsSync(DB_PATH) && existsSync(SEED_DB) && resolve(SEED_DB) !== resolve(DB_PATH)) {
  console.log(`[rima] Seeding database from ${SEED_DB}`);
  copyFileSync(SEED_DB, DB_PATH);
}

// ---- Database ----
const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");
const db: Db = wrapDb(drizzle(sqlite, { schema }));

// Run migrations (SQL files in server/drizzle, tracked in __migrations).
runMigrations(sqlite, join(process.cwd(), "server", "drizzle"));

// Seed initial admin if the users table is empty.
await ensureSeedAdmin(db);

// Register the live DB with the restore module (enables safe restore-from-backup).
setRestoreContext({ sqlite, dbPath: DB_PATH, dataDir: DATA_DIR });

// ---- App ----
const app = express();
app.set("trust proxy", 1);
// Voice webhook: the raw body must reach the handler untouched for
// signature verification, so capture it BEFORE express.json() parses
// anything. Path-scoped — no other route is affected.
app.use("/webhooks/openai-call-incoming", express.raw({ type: "*/*", limit: "1mb" }));
// Raised to allow full database backup uploads for restore (client caps at 100MB).
app.use(express.json({ limit: "150mb" }));

app.use(
  session({
    name: "rima.sid",
    secret: SESSION_SECRET,
    store: new SqliteSessionStore(sqlite),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0",
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
    },
  }) as unknown as express.RequestHandler,
);

const blobs = createBlobs(BASE_URL);

/** Build the per-request action context. */
function makeCtx(user: AuthUser | null): Ctx {
  return {
    db: () => db,
    blobs,
    invalidateQueries: () => {},
    executePrivileged: (contract, a) => contract.run(a),
    inference: { complete: (prompt, options) => anthropicComplete(prompt, options) },
    user,
  };
}
const allActions: Record<string, { request: any; handler: (ctx: Ctx, args: any) => Promise<any> }> = {
  ...Actions,
  ...authActions,
};

// ---- Action dispatch ----
app.post("/api/action", async (req, res) => {
  const { action, args } = req.body ?? {};
  if (typeof action !== "string" || !allActions[action]) {
    res.status(404).json({ ok: false, error: "Unknown action." });
    return;
  }
  const user: AuthUser | null = req.session.user ?? null;

  // Login sets the session user on success.
  if (action === "login") {
    const def = allActions[action];
    const parsed = def.request.safeParse(args ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid request." });
      return;
    }
    const result = await def.handler(makeCtx(null), parsed.data);
    if (result.ok && result.user) {
      req.session.user = result.user;
    }
    res.json(result);
    return;
  }

  if (action === "logout") {
    req.session.destroy(() => {});
    res.json({ ok: true });
    return;
  }

  if (!isActionAllowed(action, user)) {
    res.status(user ? 403 : 401).json({ ok: false, error: user ? "Not permitted for your role." : "Please sign in." });
    return;
  }

  const def = allActions[action];
  const parsed = def.request.safeParse(args ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid request.", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await def.handler(makeCtx(user), parsed.data);
    res.json(result);
  } catch (err) {
    console.error(`[action:${action}]`, err);
    res.status(500).json({ ok: false, error: "Something went wrong. Try again." });
  }
});

// ---- Blob serving (product thumbnails, receiving PDFs) ----
app.get("/api/blobs/:key", (req, res) => {
  if (!req.session.user) {
    res.status(401).json({ ok: false, error: "Please sign in." });
    return;
  }
  const key = decodeURIComponent(req.params.key);
  const path = blobPathForKey(key);
  if (!existsSync(path)) {
    res.status(404).json({ ok: false, error: "File not found." });
    return;
  }
  res.sendFile(resolve(path));
});

// ---- Sheets search (Hank retrieval bridge) ----
app.get("/api/sheets/search", sheetsSearchHandler);

// ---- Voice receiver (OpenAI Realtime SIP calls for Anya + Hank) ----
app.post("/webhooks/openai-call-incoming", voiceWebhookHandler);
app.get("/api/voice/catalog", voiceCatalogHandler);

// ---- Shopify OAuth (Anya draft orders) ----
// Public by design: Shopify redirects here logged-out after approval.
// The callback verifies state + HMAC + shop before storing anything,
// and the token itself never appears in any response.
app.get("/oauth/shopify/install", shopifyInstallHandler);
app.get("/oauth/shopify/callback", shopifyCallbackHandler);

// ---- Public SMS opt-in proof page (Twilio A2P campaign evidence) ----
// Deliberately NO sign-in check: carriers and Twilio reviewers must be
// able to open this logged-out. Static copy only; no business logic.
app.get("/sms-opt-in", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RIMA Supply Co — Text Message Opt-In</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; line-height: 1.6; margin: 0; padding: 0; background: #fff; }
main { max-width: 640px; margin: 0 auto; padding: 48px 24px; }
h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
.sub { color: #555; margin-top: 0; }
blockquote { border-left: 4px solid #c00; margin: 1.5rem 0; padding: 0.5rem 1rem; background: #fafafa; }
a { color: #0645ad; }
</style>
</head>
<body>
<main>
<h1>RIMA Supply Co — Text Message Opt-In</h1>
<p class="sub">1 Dunnell Lane, Pawtucket, RI</p>
<p>RIMA Supply Co (1 Dunnell Lane, Pawtucket, RI) sends transactional texts about your order — confirmations, ready-for-pickup, and delivery updates — only after you opt in.</p>
<p><strong>In store or by phone, our staff read this script:</strong></p>
<blockquote>"Would you like us to text you updates about your order at this number? Message and data rates may apply, message frequency varies, and you can reply STOP at any time to opt out."</blockquote>
<p>We only text customers who say yes.</p>
<p><strong>Or you can text us first</strong> at (401) 373-9126 — texting us first is your consent to a reply about your order.</p>
<p>Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help. Numbers are never shared or sold. Privacy Policy: <a href="https://rimasupply.com/policies/privacy-policy">https://rimasupply.com/policies/privacy-policy</a> · Terms: <a href="https://rimasupply.com/policies/terms-of-service">https://rimasupply.com/policies/terms-of-service</a></p>
</main>
</body>
</html>`);
});

// ---- Health check (for Railway) ----
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---- Static client ----
const clientDir = join(process.cwd(), "client", "dist");
if (existsSync(join(clientDir, "index.html"))) {
  app.use(express.static(clientDir));
  app.use((_req, res) => {
    res.sendFile(join(clientDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => res.send("RIMA Supply API — client not built yet. Run: bun run build:client"));
}

app.listen(PORT, () => {
  console.log(`[rima] Listening on :${PORT} (data: ${DATA_DIR})`);
});

// Scheduled automatic database backups: check on startup, then every hour.
// maybeAutoBackup is a no-op unless the frequency is set to daily/weekly.
import("./backup").then(({ maybeAutoBackup }) => {
  void maybeAutoBackup(sqlite, DATA_DIR);
  setInterval(() => { void maybeAutoBackup(sqlite, DATA_DIR); }, 60 * 60 * 1000);
}).catch((e) => console.log("[backup] Scheduler init failed:", e));
