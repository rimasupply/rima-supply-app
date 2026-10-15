/**
 * Scheduled automatic database backups.
 *
 * Backups are stored in DATA_DIR/backups/ as rima-backup-YYYY-MM-DD-HHmm.db.
 * Only the 10 most recent are kept. The schedule (off/daily/weekly) is stored
 * in app_settings.auto_backup_frequency; last_auto_backup_at tracks the last run.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { eq } from "drizzle-orm";

const MAX_BACKUPS = 10;
const BACKUP_FILENAME_RE = /^rima-backup-\d{4}-\d{2}-\d{2}-\d{4}\.db$/;
/** Safety copies written automatically before a database restore. Never pruned. */
const SAFETY_FILENAME_RE = /^pre-restore-\d{4}-\d{2}-\d{2}-\d{4}\.db$/;

export function backupsDir(dataDir: string): string {
  return join(dataDir, "backups");
}

export function listBackupFiles(dataDir: string): Array<{ filename: string; size_bytes: number; created_at: number }> {
  const dir = backupsDir(dataDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => BACKUP_FILENAME_RE.test(f))
    .map((f) => {
      const full = join(dir, f);
      try {
        const stat = statSync(full);
        return { filename: f, size_bytes: stat.size, created_at: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((x): x is { filename: string; size_bytes: number; created_at: number } => x !== null)
    .sort((a, b) => b.created_at - a.created_at);
}

/** Validate a backup filename to prevent path traversal. Returns the safe basename or null. */
export function safeBackupFilename(filename: string): string | null {
  const base = basename(filename);
  return BACKUP_FILENAME_RE.test(base) || SAFETY_FILENAME_RE.test(base) ? base : null;
}

/** List the pre-restore safety copies (newest first). These are never auto-pruned. */
export function listSafetyCopies(dataDir: string): Array<{ filename: string; size_bytes: number; created_at: number }> {
  const dir = backupsDir(dataDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => SAFETY_FILENAME_RE.test(f))
    .map((f) => {
      const full = join(dir, f);
      try {
        const stat = statSync(full);
        return { filename: f, size_bytes: stat.size, created_at: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((x): x is { filename: string; size_bytes: number; created_at: number } => x !== null)
    .sort((a, b) => b.created_at - a.created_at);
}

function pruneOldBackups(dataDir: string): void {
  const files = listBackupFiles(dataDir);
  for (const f of files.slice(MAX_BACKUPS)) {
    try {
      unlinkSync(join(backupsDir(dataDir), f.filename));
      console.log(`[backup] Pruned old backup ${f.filename}`);
    } catch (e) {
      console.log(`[backup] Could not prune ${f.filename}:`, e);
    }
  }
}

/**
 * Create a backup if one is due. Called on server startup and on an hourly timer.
 * Uses VACUUM INTO for a consistent snapshot even while the DB is in use.
 */
export async function maybeAutoBackup(sqlite: Database, dataDir: string): Promise<void> {
  try {
    const db = drizzle(sqlite, { schema });
    await db.insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing({ target: schema.appSettings.id });
    const [settings] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).limit(1);
    const frequency = settings?.autoBackupFrequency ?? "off";
    if (frequency !== "daily" && frequency !== "weekly") return;

    const now = Date.now();
    const lastAt = settings?.lastAutoBackupAt ? new Date(settings.lastAutoBackupAt).getTime() : 0;
    const intervalMs = frequency === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    if (now - lastAt < intervalMs) return;

    const dir = backupsDir(dataDir);
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
    const filename = `rima-backup-${stamp}.db`;
    const dest = join(dir, filename);

    // VACUUM INTO creates a consistent snapshot. Escape single quotes in path.
    sqlite.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    console.log(`[backup] Auto-backup created: ${filename}`);

    await db.update(schema.appSettings)
      .set({ lastAutoBackupAt: new Date(now), updatedAt: new Date() })
      .where(eq(schema.appSettings.id, 1));

    pruneOldBackups(dataDir);
  } catch (e) {
    console.log("[backup] Auto-backup failed:", e);
  }
}
