/**
 * Database restore from an uploaded backup file.
 *
 * Safety-first: the current live DB is copied to DATA_DIR/backups/ as
 * pre-restore-YYYY-MM-DD-HHmm.db BEFORE anything is replaced, so a bad
 * restore is reversible (download the pre-restore copy and restore from it).
 *
 * The uploaded file is validated (SQLite header + expected tables) against a
 * temp copy — the live DB is never touched unless the file checks out.
 * On success the live DB is replaced and the process exits so the container
 * restarts fresh with the restored database.
 */
import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { backupsDir } from "./backup";

interface RestoreContext {
  sqlite: Database;
  dbPath: string;
  dataDir: string;
}

let restoreCtx: RestoreContext | null = null;

/** Called once from index.ts after the live database is opened. */
export function setRestoreContext(ctx: RestoreContext): void {
  restoreCtx = ctx;
}

/** Tables every real RIMA database must have. */
const EXPECTED_TABLES = ["products", "sales", "customers"];

/** SQLite file magic: "SQLite format 3\0" (16 bytes). */
const SQLITE_MAGIC = "SQLite format 3\0";

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
}

/** Open a candidate file read-only and confirm it has the expected tables. */
function validateDatabaseFile(path: string): boolean {
  let db: Database | null = null;
  try {
    db = new Database(path, { readonly: true });
    const rows = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const names = new Set(rows.map((r) => r.name));
    return EXPECTED_TABLES.every((t) => names.has(t));
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

export interface RestoreResult {
  ok: boolean;
  error?: string;
  /** Filename of the automatic safety copy of the pre-restore database. */
  backup_of_current?: string;
}

/**
 * Validate and apply an uploaded database backup (base64-encoded .db file).
 * On success the live DB is replaced and the process exits shortly after.
 */
export function requestRestore(dataBase64: string): RestoreResult {
  if (!restoreCtx) {
    return { ok: false, error: "Restore is not available right now. Try again in a moment." };
  }
  const { sqlite, dbPath, dataDir } = restoreCtx;
  const dir = backupsDir(dataDir);
  try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }

  // --- Step 1: safety copy of the CURRENT live database ---
  const safetyName = `pre-restore-${stamp()}.db`;
  const safetyPath = join(dir, safetyName);
  try {
    try { sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);"); } catch { /* ignore */ }
    copyFileSync(dbPath, safetyPath);
  } catch (e) {
    console.log("[restore] Could not create safety copy:", e);
    return { ok: false, error: "Could not save a safety copy of your current data. Restore aborted — nothing was changed." };
  }

  // --- Step 2: decode the upload to a temp file ---
  const tmpPath = join(dir, `restore-upload-${Date.now()}.tmp`);
  const fail = (error: string): RestoreResult => {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    return { ok: false, error };
  };
  let buf: Buffer;
  try {
    buf = Buffer.from(dataBase64, "base64");
    if (buf.length < 100) throw new Error("too small");
    if (buf.subarray(0, 16).toString("binary") !== SQLITE_MAGIC) throw new Error("bad magic");
    writeFileSync(tmpPath, buf);
  } catch (e) {
    console.log("[restore] Upload rejected (not a SQLite file):", e);
    return fail("That file doesn't look like a valid RIMA database.");
  }

  // --- Step 3: validate it's a real RIMA database ---
  if (!validateDatabaseFile(tmpPath)) {
    console.log("[restore] Upload rejected (missing expected tables).");
    return fail("That file doesn't look like a valid RIMA database.");
  }

  // --- Step 4: replace the live DB, then exit so the container restarts ---
  try {
    try { sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);"); } catch { /* ignore */ }
    try { sqlite.close(); } catch { /* ignore */ }
  } catch (e) {
    console.log("[restore] Error closing live DB:", e);
  }
  try {
    copyFileSync(tmpPath, dbPath);
    // Drop stale WAL/SHM sidecars from the old database.
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      try { unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  } catch (e) {
    console.log("[restore] Failed to replace database file:", e);
    return { ok: false, error: "Restore failed while replacing the database. Your current data was not changed." };
  }

  console.log(`[restore] Database restored from upload. Safety copy saved as ${safetyName}. Exiting for restart...`);
  setTimeout(() => process.exit(0), 1500);
  return { ok: true, backup_of_current: safetyName };
}

/** True when the given file exists in the backups dir (used by tests/smoke checks). */
export function safetyCopyExists(dataDir: string, filename: string): boolean {
  return existsSync(join(backupsDir(dataDir), filename));
}
