# RIMA Supply — Standalone Store App

Self-hosted version of the RIMA Supply all-in-one store app (POS, customers,
inventory, purchase orders, receiving, field orders, returns, analytics, and
more). Migrated from the Muse web artifact to a standalone Express + React +
SQLite app with proper user authentication.

## Quick start (local)

**Prerequisites:** [Bun](https://bun.sh) 1.4+, `poppler-utils` (for PDF receiving).

```bash
cd rima-standalone
cp .env.example .env        # then edit SESSION_SECRET + SEED_ADMIN_PASSWORD
bun install

# Terminal 1 — API server (http://localhost:3000)
bun run server/src/index.ts

# Terminal 2 — client dev server (http://localhost:5173, proxies /api)
bun run dev:client
```

On first boot the server:
1. Creates `data/app.db` from the seed database (if `DATA_DIR/app.db` is missing)
2. Runs pending SQL migrations (`server/drizzle/`)
3. Seeds the admin user from `SEED_ADMIN_*` (only when the users table is empty)

**Change the admin password immediately** after first login (user menu → Change password).

## Production build

```bash
bun run build          # builds server + client
bun run start          # serves API + static client on $PORT
```

## Deploying to Railway

1. Push this directory to a Git repo, connect it to Railway.
2. Railway auto-detects the `Dockerfile` (`railway.json` sets healthcheck to `/api/health`).
3. **Add a persistent volume** mounted at `/data` (without this, the SQLite database resets on every deploy!).
4. Set environment variables in Railway:
   - `DATA_DIR=/data`
   - `SESSION_SECRET=<long random string>` — generate with `openssl rand -base64 48`
   - `BASE_URL=https://<your-app>.up.railway.app`
   - `SEED_ADMIN_USERNAME=randy`
   - `SEED_ADMIN_PASSWORD=<strong initial password>`
   - `SEED_ADMIN_NAME=Randy Leary`
   - Optional: `ANTHROPIC_API_KEY` for AI-powered warehouse PDF parsing
5. Deploy. On first boot, the seed database (1,995 products, 632 customers) is copied to the volume automatically.

**Cost:** ~$5/month (Railway Hobby) + negligible volume storage.

## Users & roles

| Role    | Access |
|---------|--------|
| `admin` | Everything, including user management |
| `manager` | Everything except user management |
| `staff` | Day-to-day ops: POS, field orders, payments, returns, lookups. No pricing, purchasing, or settings changes |

Manage users at **Settings → Users** (admin only). Staff sessions last 14 days.

## Architecture

```
server/src/
  index.ts        Express app, session auth, POST /api/action dispatch
  actions.ts      74 business-logic actions (ported from the artifact)
  auth.ts         login/logout/users, role-based access control
  sdk-compat.ts   shim replacing @hatch/space-sdk (defineAction, Ctx, z)
  schema.ts       Drizzle schema (SQLite) — 21 tables
  blobs.ts        local-filesystem blob storage (thumbnails, PDFs)
  privileged.ts   pdftotext wrapper for warehouse receiving
  migrate.ts      SQL migration runner
client/
  src/            React 19 + TanStack Query + Vite
  dist/           production build (served by Express)
data/
  app.db          SQLite database (seeded from the artifact's 2.6 MB export)
  blobs/          uploaded thumbnails & receiving PDFs
```

**Wire protocol:** the client POSTs `{action: "actionName", args: {...}}` to `/api/action`. Auth is cookie-session based (`rima.sid`).

## Data migration notes

- `data/app.db` is a direct copy of the artifact's database — all products, customers, sales, and settings preserved.
- `data/blobs/` holds uploaded files migrated from the artifact's blob storage.
- Migrations `0001`–`0021` are marked applied on existing databases; new migrations start at `0022`.
- To re-seed from the artifact later: copy `~/workspace/ts-spaces/inventory-app/app.db` over `data/app.db` and run `bun run server/src/migrate-blobs.ts`.

## Print / Email / Text

These use standard web APIs (no native bridges):
- **Print** → `window.print()` with dedicated `@media print` CSS. Invoices, packing slips, statements, and POs all print cleanly; the browser dialog offers Save-as-PDF.
- **Email** → Gmail compose URL + `mailto:` fallback, pre-filled with the customer's AP email, subject, and body.
- **Text** → `sms:` link, opens the Messages app with pre-filled body.

## Environment variables

See `.env.example` for the full list.
