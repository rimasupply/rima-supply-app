/**
 * PDF text extraction, ported from the space's privileged handler.
 * Runs `pdftotext` (poppler-utils) directly — no sandbox needed standalone.
 * The Dockerfile installs poppler-utils.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface PdfExtractResult {
  ok: boolean;
  text: string;
  error?: string;
}

export async function extractPdfText(dataBase64: string): Promise<PdfExtractResult> {
  let workDir: string | null = null;
  try {
    const raw = dataBase64.includes(",") ? (dataBase64.split(",")[1] ?? "") : dataBase64;
    const bytes = Buffer.from(raw, "base64");
    if (bytes.byteLength === 0) return { ok: false, text: "", error: "The uploaded PDF was empty." };
    if (bytes.byteLength > 12000000) return { ok: false, text: "", error: "That PDF is larger than 12 MB." };
    if (!bytes.subarray(0, 5).toString("ascii").startsWith("%PDF")) {
      return { ok: false, text: "", error: "That file does not look like a PDF." };
    }
    workDir = await mkdtemp(join(tmpdir(), "rima-receiving-"));
    const pdfPath = join(workDir, "warehouse-document.pdf");
    await writeFile(pdfPath, bytes);
    const result = spawnSync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 25000,
    });
    if (result.error) {
      return { ok: false, text: "", error: "PDF text extraction is not available on this server." };
    }
    if (result.status !== 0) {
      return { ok: false, text: "", error: "Could not read text from that PDF. It may be scanned, encrypted, or damaged." };
    }
    const text = (result.stdout ?? "").trim();
    if (!text) {
      return { ok: false, text: "", error: "No readable text was found in that PDF. It may be a scanned image rather than a text PDF." };
    }
    return { ok: true, text: text.slice(0, 240000) };
  } catch {
    return { ok: false, text: "", error: "Could not read that PDF." };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Shape matching what actions.ts expects from the old privileged contract. */
export const privileged = {
  extractPdfText: {
    async run(args: { data_base64: string }): Promise<PdfExtractResult> {
      return extractPdfText(args.data_base64);
    },
  },
};
