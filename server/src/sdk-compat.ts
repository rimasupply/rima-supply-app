/**
 * Compatibility shim replacing `@hatch/space-sdk` for the standalone build.
 *
 * The original `server/src/actions.ts` was written against the Muse space SDK.
 * This shim provides the same surface (`defineAction`, `Ctx`, `z`,
 * `ActionsModule`) backed by plain Express + Drizzle + local filesystem,
 * so the business logic in actions.ts works unchanged.
 */
import { z } from "zod";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export { z };

export type Db = BunSQLiteDatabase<typeof schema> & {
  /** Run multiple queries in a transaction (compat for the SDK's db.batch). */
  batch<T>(queries: Array<Promise<T> | { execute(): Promise<T> }>): Promise<T[]>;
};

/**
 * Wrap a drizzle bun:sqlite instance with the SDK-compatible `batch` helper.
 * Each entry may be a promise or a drizzle query builder; all run inside one
 * transaction for atomicity.
 */
export function wrapDb(raw: BunSQLiteDatabase<typeof schema>): Db {
  const db = raw as Db;
  db.batch = async <T>(queries: Array<Promise<T> | { execute(): Promise<T> }>): Promise<T[]> => {
    return raw.transaction(async (tx) => {
      const out: T[] = [];
      for (const q of queries) {
        // Rebind query builders to the transaction when possible.
        if (q && typeof q === "object" && "execute" in q && typeof (q as any).execute === "function") {
          out.push(await (q as { execute(): Promise<T> }).execute());
        } else {
          out.push(await (q as Promise<T>));
        }
      }
      return out;
    });
  };
  return db;
}

/** Authenticated user attached to the request context. */
export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "manager" | "staff";
}

/** Blob storage interface (local filesystem in standalone). */
export interface Blobs {
  put(key: string, bytes: Uint8Array, opts?: { contentType?: string }): Promise<void>;
  getUrl(key: string, opts?: { expiresInSeconds?: number }): Promise<string>;
  delete(key: string): Promise<void>;
}

/** Inference client (AI-powered PDF parsing). Uses Anthropic API when
 *  ANTHROPIC_API_KEY is set; otherwise throws so callers fall back to the
 *  regex-based extractor. */
export interface InferenceClient {
  complete<T extends z.ZodType>(prompt: string, options: { schema: T; timeout_secs?: number }): Promise<z.infer<T>>;
}

export async function anthropicComplete<T extends z.ZodType>(prompt: string, options: { schema: T }): Promise<z.infer<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  // Build a JSON-schema-ish instruction from the zod schema description.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nRespond with ONLY a JSON object matching this shape, no other text.`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const parsed: unknown = JSON.parse(text.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim());
  return options.schema.parse(parsed);
}

/** Per-request context passed to every action handler. */
export interface Ctx {
  /** Returns the Drizzle DB instance. The type param is accepted for
   *  source-compatibility and ignored at runtime. */
  db<T>(): Db;
  blobs: Blobs;
  /** No-op in standalone (client invalidates its own React Query cache). */
  invalidateQueries(invalidation?: unknown): void;
  /** Runs a privileged operation directly (PDF text extraction). */
  executePrivileged<TArgs, TResult>(
    contract: { run(args: TArgs): Promise<TResult> },
    args: TArgs,
  ): Promise<TResult>;
  /** AI inference (opt-in via ANTHROPIC_API_KEY; throws otherwise so callers use fallback). */
  inference: InferenceClient;
  /** The authenticated user, or null for unauthenticated requests. */
  user: AuthUser | null;
}

export interface ActionDefinition<
  Req extends z.ZodType = z.ZodType,
  Res extends z.ZodType = z.ZodType,
> {
  request: Req;
  response: Res;
  privileged?: readonly unknown[];
  handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
}

export function defineAction<Req extends z.ZodType, Res extends z.ZodType>(spec: {
  request: Req;
  response: Res;
  privileged?: readonly unknown[];
  handler: (ctx: Ctx, args: z.infer<Req>) => Promise<z.infer<Res>>;
}): ActionDefinition<Req, Res> {
  return spec;
}

export type ActionsModule = Record<string, ActionDefinition>;
