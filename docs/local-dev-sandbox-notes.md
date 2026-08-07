# Local Dev Notes — Sandbox / Agent Environments

Verified end-to-end in a sandbox with Node v22.22.2 / npm 10.9.7 and no Docker daemon — but LRMCRM needs neither Docker nor a real database for local dev, so that's largely moot here.

## 1. Purpose & scope

LRMCRM (product name "LOYA") is a Next.js app with an embedded, zero-setup local database. This page is the exact command sequence to get it running locally, plus what to expect at each step.

## 2. Exact commands

```bash
npm ci
cp .env.example .env            # demo AUTH_SECRET / POS_WEBHOOK_SECRET are fine for local dev
                                 # (use `.env`, not `.env.local` — this repo's .gitignore only covers `.env`)
npm run setup                   # chains db:generate + db:migrate + db:seed, against embedded PGlite
npm run build                   # optional but a good non-interactive correctness check
npm run dev                     # :3000
```

## 3. What success looks like

- `npm run setup` ends with something like:
  ```
  Seed complete: 378 POS transactions, 30 members, 6 leads, 8 deals.
  Login: admin@kopilima.my / demo1234
  ```
- `npm run build` exits 0 and lists all routes (App Router pages + API routes).
- `curl -o /dev/null -w '%{http_code}' http://localhost:3000/login` → `200`. (`/` itself 307-redirects to `/login` pre-auth — that's expected, not a failure.)

## 4. Embedded PGlite behavior

- Leaving `DATABASE_URL` unset (the default) makes the app use `@electric-sql/pglite` — an embedded WASM Postgres. No external DB service, no connection string, no Docker needed.
- Data lives under a gitignored local dir (`.pglite/`); `db:migrate` no-ops with a `No DATABASE_URL set — skipping (local dev uses PGlite, which auto-migrates)` message — that's correct, not an error.
- To reset local data: delete the PGlite data dir and re-run `npm run db:seed`.
- Set `DATABASE_URL` to a real Postgres/Neon connection string only for deployed environments (see `.env.example`'s commented example) — not needed locally.

## 5. Env vars

Only three, all in `.env.example`:
| Var | Required locally? | Notes |
|---|---|---|
| `DATABASE_URL` | No | Unset = embedded PGlite. Set = real Postgres (deployed envs only). |
| `AUTH_SECRET` | Yes (any value) | Session/auth secret. |
| `POS_WEBHOOK_SECRET` | Yes (any value) | HMAC secret for the `/api/pos/webhook` route. |

## 6. Relationship to OpenWA

See [`docs/integration-openwa-whatsapp.md`](./integration-openwa-whatsapp.md) in this repo for the design of how OpenWA (a separately-run WhatsApp API gateway) will plug into LRMCRM's existing `EspProvider` messaging seam.
