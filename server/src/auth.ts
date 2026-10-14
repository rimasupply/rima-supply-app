/**
 * Authentication: bcrypt passwords, express-session, role-based access.
 *
 * Roles:
 *  - admin:   full access, including user management
 *  - manager: everything except user management
 *  - staff:   limited to day-to-day operations (field orders, checkout,
 *             payments, lookups) — no pricing, purchasing, or settings changes
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { defineAction, type AuthUser, type Ctx } from "./sdk-compat";
import * as schema from "./schema";
import type { Db } from "./sdk-compat";

/** Actions a `staff` user is allowed to call. Everything else needs manager+. */
const STAFF_ALLOWED_ACTIONS = new Set([
  // Auth basics
  "login", "logout", "me", "changePassword",
  // Product/customer lookup
  "getInventoryStats", "listProducts", "findByBarcode", "getProduct",
  "listCustomers", "getCustomerAccount", "getCustomerPreferences",
  // Checkout / POS
  "completeSale", "recordPayment",
  // Field orders (their main job)
  "listFieldOrders", "createFieldOrder", "updateFieldOrder", "cancelFieldOrder",
  "finalizeFieldOrder",
  // Returns at the counter
  "createReturn",
  // Wishlist
  "addWishlistItem", "updateWishlistItem", "setWishlistStatus", "deleteWishlistItem",
  // Statements / deposits (view)
  "getMonthlyStatement", "getDepositReport", "listSalesOrders",
]);

/** Actions only `admin` can call. */
const ADMIN_ONLY_ACTIONS = new Set([
  "listUsers", "createUser", "updateUser", "deactivateUser",
]);

export function isActionAllowed(action: string, user: AuthUser | null): boolean {
  // Auth endpoints are always reachable (login must work unauthenticated).
  if (action === "login") return true;
  if (!user) return false;
  if (user.role === "admin") return true;
  if (ADMIN_ONLY_ACTIONS.has(action)) return false;
  if (user.role === "manager") return true;
  return STAFF_ALLOWED_ACTIONS.has(action);
}

function toAuthUser(row: typeof schema.users.$inferSelect): AuthUser {
  return { id: row.id, username: row.username, displayName: row.displayName, role: row.role };
}

async function getUserByUsername(db: Db, username: string) {
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username.trim().toLowerCase()))
    .limit(1);
  return row ?? null;
}

export const authActions = {
  login: defineAction({
    request: z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) }),
    response: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      user: z.object({ id: z.number(), username: z.string(), displayName: z.string(), role: z.string() }).optional(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const row = await getUserByUsername(db, args.username);
      if (!row || !row.active) return { ok: false as const, error: "Invalid username or password." };
      const valid = await bcrypt.compare(args.password, row.passwordHash);
      if (!valid) return { ok: false as const, error: "Invalid username or password." };
      return { ok: true as const, user: toAuthUser(row) };
    },
  }),

  logout: defineAction({
    request: z.object({}),
    response: z.object({ ok: z.boolean() }),
    async handler() {
      return { ok: true as const };
    },
  }),

  me: defineAction({
    request: z.object({}),
    response: z.object({
      user: z.object({ id: z.number(), username: z.string(), displayName: z.string(), role: z.string() }).nullable(),
    }),
    async handler(ctx) {
      return { user: ctx.user };
    },
  }),

  changePassword: defineAction({
    request: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      if (!ctx.user) return { ok: false as const, error: "Not signed in." };
      const db = ctx.db<typeof schema>();
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id)).limit(1);
      if (!row) return { ok: false as const, error: "Account not found." };
      const valid = await bcrypt.compare(args.currentPassword, row.passwordHash);
      if (!valid) return { ok: false as const, error: "Current password is incorrect." };
      const hash = await bcrypt.hash(args.newPassword, 12);
      await db.update(schema.users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(schema.users.id, row.id));
      return { ok: true as const };
    },
  }),

  listUsers: defineAction({
    request: z.object({}),
    response: z.object({
      users: z.array(z.object({
        id: z.number(), username: z.string(), displayName: z.string(),
        role: z.string(), active: z.boolean(),
        createdAt: z.string(),
      })),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.users).orderBy(schema.users.username);
      return {
        users: rows.map((r) => ({
          id: r.id, username: r.username, displayName: r.displayName,
          role: r.role, active: r.active === 1,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  createUser: defineAction({
    request: z.object({
      username: z.string().min(2).max(64),
      displayName: z.string().min(1).max(128),
      password: z.string().min(8).max(128),
      role: z.enum(["admin", "manager", "staff"]),
    }),
    response: z.object({ ok: z.boolean(), error: z.string().optional(), id: z.number().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const username = args.username.trim().toLowerCase();
      const existing = await getUserByUsername(db, username);
      if (existing) return { ok: false as const, error: "That username is already taken." };
      const hash = await bcrypt.hash(args.password, 12);
      const [created] = await db.insert(schema.users).values({
        username, displayName: args.displayName.trim(), passwordHash: hash, role: args.role, active: 1,
      }).returning({ id: schema.users.id });
      return { ok: true as const, id: created.id };
    },
  }),

  updateUser: defineAction({
    request: z.object({
      id: z.number(),
      displayName: z.string().min(1).max(128).optional(),
      role: z.enum(["admin", "manager", "staff"]).optional(),
      password: z.string().min(8).max(128).optional(),
      active: z.boolean().optional(),
    }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      // Prevent locking yourself out: can't deactivate/demote the last admin.
      if (ctx.user && args.id === ctx.user.id && (args.active === false || args.role !== "admin")) {
        return { ok: false as const, error: "You can't demote or deactivate your own admin account." };
      }
      const patch: Partial<{ displayName: string; role: "admin" | "manager" | "staff"; passwordHash: string; active: number; updatedAt: Date }> = { updatedAt: new Date() };
      if (args.displayName !== undefined) patch.displayName = args.displayName.trim();
      if (args.role !== undefined) patch.role = args.role;
      if (args.active !== undefined) patch.active = args.active ? 1 : 0;
      if (args.password !== undefined) patch.passwordHash = await bcrypt.hash(args.password, 12);
      await db.update(schema.users).set(patch).where(eq(schema.users.id, args.id));
      return { ok: true as const };
    },
  }),
};

/** Seed the initial admin account. Called once at startup if no users exist. */
export async function ensureSeedAdmin(db: Db): Promise<void> {
  const rows = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (rows.length > 0) return;
  const username = (process.env.SEED_ADMIN_USERNAME ?? "randy").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "rima-admin-2026";
  const hash = await bcrypt.hash(password, 12);
  await db.insert(schema.users).values({
    username,
    displayName: process.env.SEED_ADMIN_NAME ?? "Randy Leary",
    passwordHash: hash,
    role: "admin",
    active: 1,
  });
  console.log(`[auth] Seeded initial admin user "${username}". Change the password after first login.`);
}
