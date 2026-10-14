/**
 * Local filesystem blob storage, replacing the space SDK's blob service.
 * Files live under <DATA_DIR>/blobs/<key>. Served at /api/blobs/<key>.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Blobs } from "./sdk-compat";

function dataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), "data");
}

function keyToPath(key: string): string {
  // Prevent path traversal: keys are like "product-thumbnails/<uuid>.jpg".
  const safe = key.split("/").filter((p) => p && p !== "." && p !== "..").join(sep);
  return resolve(join(dataDir(), "blobs"), safe);
}

export function createBlobs(baseUrl: string): Blobs {
  return {
    async put(key: string, bytes: Uint8Array, _opts?: { contentType?: string }) {
      const path = keyToPath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },
    async getUrl(key: string, _opts?: { expiresInSeconds?: number }) {
      // Direct URL; auth is enforced by the serving route for private blobs.
      return `${baseUrl}/api/blobs/${encodeURIComponent(key)}`;
    },
    async delete(key: string) {
      await rm(keyToPath(key), { force: true }).catch(() => undefined);
    },
  };
}

export function blobPathForKey(key: string): string {
  return keyToPath(key);
}
