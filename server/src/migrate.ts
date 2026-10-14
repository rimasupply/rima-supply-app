/**
 * Simple SQL migration runner. Reads *.sql files from the drizzle folder in
 * sorted order, tracks applied migrations in `__migrations`, and executes
 * pending ones.
 *
 * Handles the existing production app.db (which predates the tracking table):
 * if the `products` table already exists but no migration history does, we
 * assume migrations 0001–0021 are applied and only run 0022+.
 */
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASELINE_APPLIED = ["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "0011", "0012", "0013", "0014", "0015", "0016", "0017", "0018", "0019", "0020", "0021"];

export function runMigrations(sqlite: Database, migrationsFolder: string): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS __migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);

  const applied = new Set(
    (sqlite.query("SELECT id FROM __migrations").all() as Array<{ id: string }>).map((r) => r.id),
  );

  // Baseline: existing production DB already has 0001–0021 applied.
  const hasProducts = sqlite
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
    .all().length > 0;
  if (hasProducts && applied.size === 0) {
    const now = Date.now();
    const stmt = sqlite.prepare("INSERT OR IGNORE INTO __migrations (id, applied_at) VALUES (?, ?)");
    for (const id of BASELINE_APPLIED) {
      stmt.run(id, now);
      applied.add(id);
    }
    console.log("[migrate] Baseline: marked 0001–0021 as applied (existing database).");
  }

  const files = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const id = file.slice(0, 4);
    if (applied.has(id)) continue;
    const sql = readFileSync(join(migrationsFolder, file), "utf8");
    console.log(`[migrate] Applying ${file}…`);
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO __migrations (id, applied_at) VALUES (?, ?)").run(id, Date.now());
  }
  console.log("[migrate] Done.");
}
