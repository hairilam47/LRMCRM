# Integration Design: WhatsApp via OpenWA

**Status: implemented (single-send provider, inbound webhook, and bulk blast campaigns).** This note started as design-only groundwork and now doubles as the as-built reference — §4/§5 describe what's actually in the codebase; §9 covers the blast feature this seam was extended for. See [`docs/blast-campaigns.md`](./blast-campaigns.md) for how to use it.

## 1. Context

LRMCRM's README already lists "Real ESP / mailing queue" as a deferred Phase-2 seam, describing `message_outbox` as the producer contract and "swap the consumer for Redis + ESP dispatcher" as the plan. This note is the concrete design for filling that seam with WhatsApp, using **OpenWA** (`hairilam47/openwa`) — a self-hosted NestJS WhatsApp API gateway — as the provider behind it.

## 2. The seam that already exists (as-is)

`src/modules/automation/providers.ts` defines:

```ts
export interface EspProvider {
  name: string;
  send(msg: OutboundMessage): Promise<DispatchOutcome>;
}

export const PROVIDERS: Record<string, EspProvider> = {
  mock: new MockProvider(),
  console: new ConsoleProvider(),
};
```

Only `MockProvider`/`ConsoleProvider` are implemented today. A commented-out `TwilioProvider` shows the intended pattern for a real integration: a plain `fetch()` call, no SDK dependency. `dispatch.ts` drains the `message_outbox` table through `getProvider(db, orgId)` — resolved per-org from `org_settings.espProvider`, switchable at runtime via Settings → Integrations. `messageOutbox.channel` is a free-text column, currently only ever populated with `sms | push | email` — `whatsapp` is not a recognized value anywhere yet.

**This is exactly the plug point.** No other part of the codebase needs to change to add a channel — that's the whole point of the abstraction.

## 3. Deployment constraint that drives the design

LRMCRM deploys to Vercel as stateless serverless functions (`vercel.json` is minimal; `next.config.ts` marks `@electric-sql/pglite` as `serverExternalPackages`, itself a sign the app is built with serverless constraints in mind). OpenWA needs the opposite: a **long-lived, single, in-memory process** holding the WhatsApp session (a real browser/socket connection plus QR-pairing state) — Vercel functions cannot host that.

**Conclusion: OpenWA runs as its own independently-hosted, always-on service** (a VM or a platform like Fly.io/Railway/Render — anywhere that isn't Vercel functions), and LRMCRM talks to it purely as an **HTTP client**. No monorepo merge, no embedding OpenWA's NestJS code inside the Next.js app — loose HTTP coupling only, which also happens to be exactly the pattern the `TwilioProvider` example already models.

## 4. Outbound (LRMCRM → OpenWA) — implemented

`OpenWaProvider` in `src/modules/automation/providers.ts`, registered as `PROVIDERS.whatsapp`. Used by the *existing* single-message automation path (`dispatch.ts`'s outbox drain — e.g. a POS-triggered rule with `channel: "whatsapp"`), **not** by blast campaigns — see §9 for why bulk sends go through a separate path.

```ts
export class OpenWaProvider implements EspProvider {
  name = "openwa";
  async send(msg: OutboundMessage): Promise<DispatchOutcome> {
    const chatId = toWhatsAppChatId(msg.to); // src/lib/phone.ts — "<digits>@c.us"
    const endpoint = msg.mediaUrl ? "send-image" : "send-text";
    const res = await fetch(`${process.env.OPENWA_BASE_URL}/api/sessions/${process.env.OPENWA_SESSION_ID}/messages/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENWA_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(msg.mediaUrl ? { chatId, url: msg.mediaUrl, caption: msg.body } : { chatId, text: msg.body }),
    });
    // ... error handling, returns { ok, providerRef, error }
  }
}
```

Env vars: `OPENWA_BASE_URL`, `OPENWA_API_KEY` (an OPERATOR-role key, ideally scoped via `allowedSessions` to just `OPENWA_SESSION_ID`), `OPENWA_SESSION_ID` (a session already paired to a real WhatsApp number — pairing is a manual, human, one-time step, see §7). All three optional — the provider returns a clean `{ ok: false, error }` rather than throwing when unconfigured, so the rest of the app runs fine without WhatsApp set up.

Confirmed real endpoints: `POST /api/sessions/:sessionId/messages/send-text` and `.../send-image` (`src/modules/message/message.controller.ts`), API-key-authenticated via `Authorization: Bearer`.

## 5. Inbound (OpenWA → LRMCRM) — implemented

`src/app/api/whatsapp/webhook/route.ts`, mirroring `src/app/api/pos/webhook/route.ts`'s HMAC pattern with two differences: OpenWA signs as **`X-OpenWA-Signature: sha256=<hex>`** (prefixed, vs. the POS route's unprefixed `x-loya-signature`), and verification is **required** whenever `OPENWA_WEBHOOK_SECRET` is set — not only-if-a-signature-is-present like the POS route (which intentionally also accepts its own built-in simulator's unsigned requests). This endpoint has exactly one legitimate caller and mutates data, so an unsigned request is rejected outright once a secret exists; skipped only when no secret is configured at all.

Handles two event types today:
- **`message.ack` / `message.failed`** — advances the matching `message_outbox` row's status (`sent → delivered → read`, or `→ failed`), correlated by `message_outbox.to_chat_id` (a snapshot of the resolved `<digits>@c.us` chatId, set at send time — see §9) matched against the chatId embedded in OpenWA's `messageId` (format `<fromMe>_<chatId>_<suffix>`).
- **`message.received`** — opt-out handling: a reply body of `stop`/`unsubscribe`/`berhenti`/`opt out` (case-insensitive) flips `contacts.wa_consent` to `false` for the matching phone number. This is the one inbound signal every WhatsApp Business sender is expected to honor.

All other subscribed events are accepted (`200`) and ignored — OpenWA's webhook delivery is at-least-once with retry, so an unrecognized event type must not be treated as an error.

## 6. What this integration is *not*

- Not a monorepo merge. OpenWA and LRMCRM stay separate repos/deployments.
- Not a code-level embedding of OpenWA inside the Next.js app — every call is a plain `fetch()` over HTTP.

## 7. Open items

- **Session ownership**: who creates and pairs (QR-scans) the WhatsApp session LRMCRM sends from, and on what phone/account. Still an inherently manual, human, one-time step (see OpenWA's `docs/local-dev-sandbox-notes.md`, §5) — nothing here automates it.
- **Retry/backoff**: `dispatch.ts`'s single-message outbox drain still has no retry — a failed row just gets marked `failed`. Blast campaigns (§9) inherit OpenWA's own bulk-send pacing/retry instead, since they bypass this loop entirely.
- **Mapping inbound events onto the automation engine**: `message.received` currently only feeds the opt-out check (§5) — it doesn't yet touch `src/modules/automation/engine.ts` (lead scoring, loyalty triggers). Still open if a two-way conversational flow is ever wanted.
- **Secrets management**: `OPENWA_API_KEY`/`OPENWA_WEBHOOK_SECRET`/`ANTHROPIC_API_KEY` need to land in Vercel's env var config for deployed environments — local `.env` only covers dev.
- **Multi-tenancy**: shipped as **global env vars for v1** (one shared WhatsApp number/session for the whole app) — matches the existing Twilio-stub convention and this deployment's current single-org reality. `getProvider()` is still org-scoped (`org_settings.espProvider`), so per-org `OPENWA_SESSION_ID` config is a natural extension if this ever runs multi-org, but nothing forces it today.

## 8. Related

- [`docs/local-dev-sandbox-notes.md`](./local-dev-sandbox-notes.md) (this repo) — running LRMCRM locally.
- [`docs/blast-campaigns.md`](./blast-campaigns.md) (this repo) — how to use the blast feature, consent model, media/AI-drafting notes.
- `docs/local-dev-sandbox-notes.md` in the OpenWA repo — running OpenWA locally, including why real WhatsApp pairing can't be done in a sandbox.

## 9. Blast campaigns — bulk sends bypass the single-message provider

The original design above (`OpenWaProvider.send()`, one message per call) is the right shape for the *existing* automation flows (a POS receipt, a win-back nudge) — low volume, one recipient at a time. It is the *wrong* shape for a marketing blast to hundreds of opted-in members: looping `send()` gives zero pacing between calls (`dispatch.ts`'s loop has none), which is exactly the "cold-blasting strangers" pattern OpenWA's own README calls out as the top way to get a WhatsApp number banned.

Instead, `src/modules/blast/` (see [`docs/blast-campaigns.md`](./blast-campaigns.md) for the full design) talks to OpenWA's **`POST /api/sessions/:sessionId/messages/send-bulk`** directly — up to 100 recipients per call, OpenWA paces and sequences delivery server-side (`delayBetweenMessages`/`randomizeDelay`), and returns a `batchId` immediately (202) while sending continues asynchronously. `message_outbox` rows gained `media_url`, `to_chat_id`, `provider_ref`, `campaign_id`, and `error` columns to support this — see the migration in `src/db/migrations/` for the exact shape. A new `blast_campaigns` table tracks campaign-level intent and aggregate progress; `contacts.wa_consent`/`wa_consent_at` gate who can be targeted at all.
