/**
 * Sheets search endpoint for the Hank retrieval bridge.
 *
 * Searches the filed TDS/SDS library (data/sheets/sheets-index.json +
 * data/sheets/txt/*.txt) by product code, sheet name, or extracted text.
 * The voice session calls this to ground Hank's answers in real sheets:
 * no lookup result means Hank takes a message instead of answering.
 *
 * Auth: header x-sheets-key must equal SHEETS_API_KEY when the key is
 * set. Fail-closed in production: if NODE_ENV is production and no key
 * is configured, every request is refused (503) rather than served open.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Request, Response } from "express";

type SheetEntry = {
  code: string;
  type: string;
  file: string;
  md5: string;
  bytes: number;
  name: string;
  txt: string;
};

type SheetIndex = {
  count: number;
  sheets: SheetEntry[];
};

type SheetHit = {
  code: string;
  type: string;
  name: string;
  file: string;
  snippet: string;
};

const SHEETS_DIR = join(process.cwd(), "data", "sheets");
const INDEX_PATH = join(SHEETS_DIR, "sheets-index.json");
const TXT_DIR = join(SHEETS_DIR, "txt");

let indexCache: SheetIndex | null = null;
const txtCache = new Map<string, string>();

function loadIndex(): SheetIndex {
  if (indexCache) return indexCache;
  if (!existsSync(INDEX_PATH)) throw new Error("sheets index missing");
  indexCache = JSON.parse(readFileSync(INDEX_PATH, "utf8")) as SheetIndex;
  return indexCache;
}

function readTxt(name: string): string {
  const hit = txtCache.get(name);
  if (hit !== undefined) return hit;
  const path = join(TXT_DIR, name);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  txtCache.set(name, text);
  return text;
}

function snippetFor(text: string, needle: string): string {
  const at = text.toLowerCase().indexOf(needle);
  if (at === -1) return "";
  const start = Math.max(0, at - 80);
  const end = Math.min(text.length, at + needle.length + 120);
  const piece = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "..." : "") + piece + (end < text.length ? "..." : "");
}

export function sheetsSearchHandler(req: Request, res: Response): void {
  const key = process.env.SHEETS_API_KEY ?? "";
  if (process.env.NODE_ENV === "production" && !key) {
    res.status(503).json({ ok: false, error: "Sheets search not configured." });
    return;
  }
  if (key && req.header("x-sheets-key") !== key) {
    res.status(401).json({ ok: false, error: "Unauthorized." });
    return;
  }
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ ok: false, error: "Missing query." });
    return;
  }
  let index: SheetIndex;
  try {
    index = loadIndex();
  } catch {
    res.status(500).json({ ok: false, error: "Sheets index unavailable." });
    return;
  }
  const needle = q.toLowerCase();
  const results: SheetHit[] = [];
  for (const sheet of index.sheets) {
    const hayName = `${sheet.code} ${sheet.name} ${sheet.type}`.toLowerCase();
    if (hayName.includes(needle)) {
      results.push({ code: sheet.code, type: sheet.type, name: sheet.name, file: sheet.file, snippet: sheet.name });
    } else {
      const text = readTxt(sheet.txt);
      const snip = snippetFor(text, needle);
      if (snip) results.push({ code: sheet.code, type: sheet.type, name: sheet.name, file: sheet.file, snippet: snip });
    }
    if (results.length >= 10) break;
  }
  res.json({ ok: true, results });
}
