// Typed RPC client for the standalone RIMA Supply app.
//
// Each call is `api.actionName(args)` -> POST /api/action with JSON body
// `{ action: "actionName", args }`. The server returns the action's JSON
// response directly. Types are derived from the server's zod action
// definitions (type-only: the client bundle never pulls in server runtime).
//
// Usage mirrors the old space client:
//
//     import { api, type ApiResponse } from "./api";
//     type Product = ApiResponse<typeof api, "listProducts">["products"][number];

import type { Actions } from "../../server/src/actions";
import type { authActions } from "../../server/src/auth";
import type { z } from "zod";

type AllActions = typeof Actions & typeof authActions;

type ActionFn<Req, Res> = (
  args: Req extends z.ZodType ? z.input<Req> : never,
) => Promise<Res extends z.ZodType ? z.output<Res> : never>;

export type ActionClient = {
  [K in keyof AllActions]: AllActions[K] extends {
    request: infer Req;
    response: infer Res;
  }
    ? ActionFn<Req, Res>
    : never;
};

/** Response type for an action: ApiResponse<typeof api, "listProducts"> */
export type ApiResponse<TClient, TAction extends keyof TClient> =
  TClient[TAction] extends (args: any) => Promise<infer R> ? R : never;

/** Request-args type for an action: ApiRequest<typeof api, "listProducts"> */
export type ApiRequest<TClient, TAction extends keyof TClient> =
  TClient[TAction] extends (args: infer A) => Promise<any> ? A : never;

/** Thrown when the server answers 401 — the session is missing/expired. */
export class AuthError extends Error {
  readonly status = 401;
  constructor(message = "Please sign in.") {
    super(message);
    this.name = "AuthError";
  }
}

async function callAction(action: string, args: unknown): Promise<any> {
  const res = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ action, args: args ?? {} }),
  });
  if (res.status === 401) {
    throw new AuthError();
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data.error === "string" && data.error.length > 0
        ? data.error
        : `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return data;
}

export const api = new Proxy({} as Record<string, (args: any) => Promise<any>>, {
  get(_target, prop) {
    if (typeof prop !== "string") return undefined;
    // Never resolve as a thenable if someone awaits the proxy itself.
    if (prop === "then") return undefined;
    return (args: any) => callAction(prop, args);
  },
}) as ActionClient;
