# LOYA — CRM · Loyalty · POS

CRM with an integrated loyalty engine for F&B/retail, prototyped on the **Kopi Lima Group** narrative (3-store Malaysian café chain + corporate-catering B2B pipeline).

**Stack:** Next.js 15 (App Router, Server Actions) · React 19 · TypeScript strict · Tailwind v4 · Drizzle ORM · Postgres (embedded PGlite for zero-setup dev, Neon-ready for deploy) · Zod

---

## Quickstart

```bash
npm install
npm run setup     # generates SQL migrations + seeds through the real ingestion pipeline
npm run dev       # http://localhost:3000
```

**Login:** `admin@kopilima.my` / `demo1234`

No database server needed — the app runs on embedded PGlite (real Postgres compiled to WASM) stored in `.pglite/`. Delete that folder and re-run `npm run db:seed` to reset the demo.

**Deploying:** set `DATABASE_URL` to a Neon/Postgres connection string; the client swaps drivers automatically (`src/db/index.ts`). Run migrations from `src/db/migrations/` with your preferred runner.

## The demo script (5 minutes)

1. **Log in as `admin@kopilima.my`** — you land on the **hub**: two cards, CRM and Loyalty, each with live headline numbers (open pipeline + stale deals on CRM; 30-day revenue + active members on Loyalty). This is the executive entry point — pick a workspace, not a page.
2. **Click into Loyalty → Dashboard**, then **POS → Simulator** — the centerpiece. Look up `+6012 3000000` (Nurul Aisyah), build a basket, **⚡ Fire webhook**. It POSTs `/api/pos/webhook` exactly as a real POS would; the thermal receipt prints the computed rewards — points × tier multiplier, cashback, stamp progress — and every automation the engine evaluated, including *why* skipped rules skipped.
3. Add a **Signature Laksa Bowl** and fire again — watch the stamp card tick toward 8; on completion a Free Signature Bowl voucher is issued automatically.
4. **Members → Nurul** — append-only points/wallet ledgers with running balances, dark wallet card, stamp grid, voucher chips.
5. **Switch workspace** (the "Switch" link next to the workspace label, admin-only) back to the hub, then into **CRM**. The CRM dashboard leads with three hero numbers — open pipeline value, stale deals, lead→SQL conversion — plus an actual stale-deals list (not just a count) and a lead funnel.
6. **Leads → + Simulate inbound lead** — fit+intent scoring live; ≥ 70 becomes SQL with a 15-minute-SLA task round-robined to a rep, < 70 enrolls in nurture via the outbox.
7. **⚙ Settings** (link on the hub, admin-only) — **Users**: change a role, create a new user and watch the one-time password appear. **Integrations**: flip the ESP provider from Mock to Console, then go dispatch something in the Loyalty outbox and check the terminal running `npm run dev` — you'll see it actually print there, proving the switch is live, not cosmetic. **Audit log**: every one of those actions just showed up here with your name attached.
8. **Roles** — log out and back in as `farah@kopilima.my` (sales), `mei@kopilima.my` (marketing), or `aiman@kopilima.my` (store_ops), all `demo1234`. None of them see the hub or Settings — each has exactly one workspace, so `/` sends them straight in. Try a URL outside their access and watch it bounce to their own dashboard with a denial banner instead of a dead page.

## Architecture

```
src/
  db/
    schema/        core · crm · loyalty · pos   (24 tables)
    migrations/    generated SQL
    index.ts       dual-driver client (PGlite ↔ postgres-js/Neon)
    seed.ts        seeds through the REAL pipeline — data is engine-consistent
  modules/
    loyalty/engine.ts     points · cashback · stamps · tiers (append-only ledgers)
    pos/ingest.ts         webhook validation → identifier resolution → atomic ingestion
    automation/engine.ts  pos.completed rules + win-back sweep
    crm/scoring.ts        fit/intent scoring · SQL routing · SLA tasks
  components/
    app-shell.tsx  workspace-scoped sidebar shell (collapsible, role-aware nav)
    nav-links.tsx  nav item definitions tagged by workspace + role
  app/
    (auth)/login          dark treatment
    (app)/layout.tsx       auth gate only — no chrome (avoids double-chrome on the hub)
    (app)/page.tsx          the hub — smart entry: single-workspace roles redirect straight
                             through, multi-workspace roles (admin) see the two-card picker
    (app)/crm/layout.tsx    CRM workspace shell + role gate (admin, sales)
    (app)/crm/…             dashboard · leads · accounts · contacts · deals
    (app)/loyalty/layout.tsx  Loyalty workspace shell + role gate (admin, marketing, store_ops)
    (app)/loyalty/…         dashboard · members · programs · vouchers · pos/* · marketing/*
    api/pos/webhook       HMAC-verified POS ingestion endpoint
    api/leads/capture     public web-form intake
```

**Two workspaces, one app.** CRM (B2B: leads, accounts, deals) and Loyalty (B2C: members, POS, vouchers, marketing) are structurally separate — different sidebar, different dashboard, different role gate at the layout level — even though they share one login, one database, and one design system. POS and Marketing live *inside* the Loyalty workspace rather than as peers, since operationally both are loyalty-program machinery (POS feeds the engine; Marketing/Outbox is loyalty-triggered messaging).

**Non-negotiables implemented:**
- **Ledger architecture** — `points_ledger` / `wallet_ledger` are append-only; balances are always `SUM(delta)`. Rollups on `loyalty_members` are caches, recomputed on write.
- **Atomic ingestion** — transaction insert, line items, rewards, tier change, and automation outbox commit together or roll back together.
- **Money as integer sen** everywhere.

## Phase-2 seams (deferred, containers built)

| Deferred | Seam in place |
| :--- | :--- |
| Real ESP / mailing queue | `message_outbox` table is the producer contract. **WhatsApp shipped in Sprint 6** via [OpenWA](https://github.com/hairilam47/OpenWA) (`OpenWaProvider` + blast campaigns, see `docs/integration-openwa-whatsapp.md`) — SMS/email/push (Twilio-style) remain the documented-but-unwired stub in `providers.ts`. |
| CPQ & discount guardrails | `deals.gateState` JSONB + stage `gateRequirements` already model approvals |
| Better Auth | `src/lib/auth.ts` is the only auth surface; call sites use `requireUser()` only |
| Deal kanban / accounts / contacts CRUD | Schema complete; routes reserved in nav (Sprint 2) |
| POS partner adapters | `posWebhookSchema` is the canonical payload; adapters normalize into it |
| Identity resolution (fuzzy) | `guest_profiles.merged_contact_id` merge path |

## Security & dependency hygiene

`npm install` should report **0 vulnerabilities** and no funding nag. If it doesn't:

1. `npm audit` — see what's actually vulnerable and how deep it's nested.
2. Prefer `package.json` `"overrides"` over `npm audit fix --force`. The `--force` flag often downgrades a top-level package (e.g. it once suggested downgrading Next.js 15 → 9 to fix a vulnerability buried three levels down in a dev-only tool). `overrides` forces just the vulnerable nested package to a patched version without touching what you actually depend on.
3. Re-run `npm run typecheck && npm run build` after any override — confirm nothing broke before trusting the fix.
4. `.npmrc` sets `fund=false` to silence the funding nag; it does **not** disable `npm audit` — vulnerabilities still surface normally.
5. `npm run audit:check` fails the build on moderate+ severity — wire this into CI for any project going forward.

Current overrides in `package.json` and why: `sharp` and `postcss` are pulled in *inside* Next.js's own dependency tree at versions older than what's published; `esbuild` is pulled in via `drizzle-kit`'s legacy `@esbuild-kit/*` dev-tooling chain (a moderate, dev-server-only issue, deprecated upstream in favor of `tsx`). None of these are things this project depends on directly — they're nested inside tools we do depend on.


## Sprint status

**Sprint 1:** foundation + loyalty spine — schema, engines, seed, auth, dashboard, members, member detail, simulator, transactions, leads (scored intake), outbox.

**Sprint 2:** accounts & contacts CRUD, deal kanban with live MEDDPICC gate enforcement, program config, voucher template manager + manual issuance, wallet top-up with reload bonus, prepaid pack purchases, referral codes.

**Sprint 3:** deal creation, manual balance adjustment (points/wallet, ledger-logged, reason required), stamp card & voucher template editing, prepaid pack creation, CSV export (members/transactions), and a working mock ESP dispatcher.

**Sprint 4:** role-based access control (admin/sales/marketing/store_ops, enforced server-side on every route), deal activity timeline with notes, bulk voucher campaigns by segment, CSV export for leads/deals, and a proper `EspProvider` abstraction replacing the single-function mock dispatcher.

**Layout fix:** removed a hard `max-w-[1180px]` content cap that was leaving dead space on wide monitors, and made the sidebar collapsible (216px ↔ 68px icon rail, persisted to `localStorage`) with a new hand-drawn icon set.

**IA redesign (this build):** paused Sprint 5 feature work to fix the product's information architecture, which was presenting as loyalty-first even though the B2B pipeline was fully built — a legibility problem, not a data problem.

- **A landing hub replaces the unified dashboard.** After login, `/` now runs role logic: single-workspace roles (sales → CRM only; marketing/store_ops → Loyalty only) skip straight through to their workspace — there's no real choice to present, so no picker screen in their way. Admin (or any future multi-workspace role) sees a two-card hub — **CRM** and **Loyalty** — each carrying live headline numbers (open pipeline + stale deals; 30-day revenue + active members) so the entry point is informative, not just a menu.
- **Two structurally separate workspaces**, not one flat sidebar. `/crm/*` and `/loyalty/*` each have their own layout, their own role gate (`requireRole` at the layout level, on top of each page's existing per-item gate), their own sidebar, and their own dashboard. POS and Marketing moved from top-level route groups to live *inside* Loyalty (`/loyalty/pos/*`, `/loyalty/marketing/*`), matching how they actually function — POS feeds the loyalty engine, Marketing is loyalty-triggered messaging.
- **The CRM dashboard is new and finally gives B2B real weight**: three hero KPIs (open pipeline value, stale-deal count, lead→SQL conversion), an actual stale-deals list with deal names and days-stuck (not just a count buried in a strip), a lead funnel (New → MQL → SQL → Converted → Lost), and a pipeline-by-stage breakdown. Previously all of this was a single small strip at the bottom of a loyalty-heavy page.
- **The Loyalty dashboard** is the old unified dashboard minus the CRM content, plus a queued-outbox teaser tying Marketing into the picture.
- **A workspace switcher** — small "Switch" link in the sidebar header — lets multi-workspace users (admin) jump between CRM, Loyalty, and the hub without logging out. It's hidden entirely for single-workspace roles, since switching to a workspace they don't have would just bounce them back.

Verified this restructure by generating session cookies for all four roles and hitting the running server directly: admin gets `200` with hub content on `/`; sales, marketing, and store_ops all get `307` redirects straight to their one workspace's dashboard, never seeing the hub. Confirmed the "Switch" link renders for admin and is genuinely absent for sales (verified via a clean isolated fetch, after an initial combined test run gave a false positive from a stale temp file). Re-verified every RBAC boundary from Sprint 4 still holds under the new `/loyalty/pos/*` and `/loyalty/marketing/*` paths. Confirmed the denied-access flow forwards `?denied=1` correctly through the hub redirect so single-workspace users still see the banner on their own dashboard rather than losing it. `tsc`, `next build`, and `npm audit` all clean.

**Sprint 5 (this build):** audit accountability, admin self-service, and workspace analytics depth.

- **Audit trail foundation** — new `audit_log` table (`actorId`, `action`, `entityType`, `entityId`, `detail` jsonb) with a `writeAudit()` helper wired into every action that needed a "who did this" answer: manual points/wallet adjustments (which previously had no actor at all), bulk voucher campaigns, voucher template edits, role changes, user creation, and ESP provider switches.
- **Settings — Users** (admin-only, new `/settings/*` area outside both workspaces) — inline role changes, a routable-flag toggle, and new-user creation with an auto-generated one-time password shown once on screen and never persisted in plaintext.
- **Settings — Audit log** — a readable, filterable-by-eye feed of everything above, with human-language descriptions per action type rather than raw JSON.
- **Settings — Integrations** — the ESP provider is now genuinely runtime-switchable (new `org_settings` table, `getProvider()` resolves per-org instead of a hardcoded export) between Mock and Console, proving the abstraction actually works end to end rather than just existing in theory. Real Twilio/Resend credentials aren't available in this environment, so that integration stays a documented stub — the page states this plainly rather than pretending otherwise.
- **CRM rep leaderboard** — deals won/value and open pipeline per rep, added to the CRM dashboard. Required fixing the seed data, which had never assigned deal owners; Farah and Daniel now round-robin across 8 seeded deals (up from 6) so the leaderboard has real numbers.
- **Loyalty member lifecycle breakdown** — Active (<30d) / At-risk (30–60d) / Lapsed (60d+) segmentation with lifetime-value-at-risk, added to the Loyalty dashboard, using data already tracked rather than new instrumentation.

Verified by exercising every new code path directly first — adjustments now correctly carry actor identity into the audit log, a campaign run and a role change both produced correctly-attributed entries, and switching the ESP provider from mock to console via direct DB write then re-resolving it produced real console output confirming the switch actually changes runtime behavior, not just a stored preference. Then re-verified over real HTTP against the running server with signed sessions: admin gets `200` on all three Settings pages, sales and marketing both get `307 → /?denied=1` on all three, and both new dashboard sections (rep leaderboard, member lifecycle) render real seeded data. New migration (`0001_lethal_quasimodo.sql`) generated cleanly for the two new tables. `tsc`, `next build`, and `npm audit` all clean.

**Sprint 6 (this build):** WhatsApp shipped as a real ESP channel — outbound send, inbound delivery/read status, opt-out handling, and a new blast-campaign feature for Loyalty marketing.

- **`OpenWaProvider`** (`src/modules/automation/providers.ts`) — the previously-stubbed `EspProvider` slot filled in for real, backed by [OpenWA](https://github.com/hairilam47/OpenWA), a self-hosted WhatsApp API gateway that runs as its own always-on service (not embeddable in this app's Vercel deployment — see `docs/integration-openwa-whatsapp.md` §3 for why). Registered as `PROVIDERS.whatsapp`, used by the existing single-message `dispatch.ts` outbox drain for triggered automation sends (text or single-image).
- **Inbound webhook** (`src/app/api/whatsapp/webhook/route.ts`) — HMAC-verified (mirrors the POS webhook's pattern, tightened: verification is mandatory whenever a secret is configured, not only-if-signed). Advances `message_outbox` rows through `sent → delivered → read` from OpenWA's `message.ack` events, and handles `STOP`/`UNSUBSCRIBE` replies by flipping `contacts.wa_consent` off.
- **Blast campaigns** (`/loyalty/marketing/blast`, new `src/modules/blast/` module) — compose a message (merge fields `{{name}}`/`{{first_name}}`/`{{tier}}`/`{{points}}`, optional media URL, optional Claude-drafted copy via `ANTHROPIC_API_KEY`), pick a segment (same all/gold/silver/bronze/lapsed_30 set as the Vouchers bulk campaign), and send to everyone in that segment who's opted in. Deliberately bypasses `dispatch.ts`'s single-message loop (which has no pacing) in favor of OpenWA's own `send-bulk` endpoint — up to 100 recipients per call, server-side paced, chunked automatically for larger audiences. See `docs/blast-campaigns.md` for the full usage guide.
- **Consent as a first-class gate, not an afterthought** — new `contacts.wa_consent`/`wa_consent_at` columns, default `false`. The audience resolver (`src/modules/blast/audience.ts`) filters on it unconditionally; the composer shows live "X opted in of Y in segment" counts so a marketer sees real reach before sending, not after. A member detail toggle and the inbound STOP-reply handler are the two ways consent changes. This exists because unsolicited WhatsApp blasting is explicitly the top way to get a business number restricted — the gate is load-bearing, not decorative.
- **New `blast_campaigns` table** tracks campaign-level intent/status/counts separately from the per-recipient `message_outbox` rows it fans out to (which gained `media_url`, `to_chat_id`, `provider_ref`, `campaign_id`, `error` columns, plus `sent`/`delivered`/`read` outbox statuses replacing the old mock-only `sent_mock`).

Verified end-to-end against a real running OpenWA instance in this sandbox (not against a real paired WhatsApp number — QR pairing is an inherently human step, out of scope here): booted OpenWA natively, confirmed `OpenWaProvider` returns clean typed errors for unconfigured/unreachable/session-not-found/bad-phone cases rather than throwing, sent real HTTP requests to `/api/whatsapp/webhook` and confirmed missing/wrong/correct HMAC signatures return 401/401/200 respectively, and confirmed a `message.ack` webhook correctly advances a seeded `message_outbox` row from `sent` to `delivered` (with `providerRef` upgraded from batch ID to the precise message ID) while a `STOP` reply correctly flips the matching contact's consent back to `false`. `tsc`, `next build` all clean; new migration (`0002_big_reavers.sql`) applies cleanly against a fresh PGlite database.

**Sprint 7 (next):** real WhatsApp session pairing + a live send once a phone/number is available, file upload for blast media (v1 requires an already-public URL), per-org WhatsApp credentials if this ever runs multi-org, bulk lead import, per-rep activity SLA reporting (we capture `firstOutreachAt` but never surface compliance), and a "mark deal lost" flow with reason capture.
