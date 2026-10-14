/**
 * One-time migration: export blobs from the Muse artifact's blob storage
 * into the standalone `data/blobs/<key>` file layout.
 *
 * Usage: bun run server/src/migrate-blobs.ts
 */
import { Database } from "bun:sqlite";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const SRC_BLOBS = join(process.env.HOME ?? "", "workspace/ts-spaces/inventory-app/blobs");
const DEST_BLOBS = join(process.cwd(), "data", "blobs");

interface BlobRow {
  key: string;
  object_id: string | null;
}

const idx = new Database(join(SRC_BLOBS, "index.sqlite"), { readonly: true });
const rows = idx.query("SELECT key, object_id as objectId FROM blobs").all() as Array<{ key: string; objectId: string | null }>;

let copied = 0;
let missing = 0;
for (const row of rows) {
  if (!row.objectId) {
    missing++;
    continue;
  }
  const src = join(SRC_BLOBS, "objects", row.objectId.slice(0, 2), row.objectId);
  const dest = join(DEST_BLOBS, row.key);
  try {
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    copied++;
  } catch {
    missing++;
  }
}
console.log(`[migrate-blobs] Copied ${copied} blobs, ${missing} missing.`);
