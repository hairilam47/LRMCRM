# Integration Design: WhatsApp via OpenWA

**Status: design note — not implemented.** This is groundwork for the future merge, written before any provider/webhook code is added, per the "analyze requirements and confirm we can run this locally before we start to merge" ask that prompted it.

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

## 4. Proposed design — outbound (LRMCRM → OpenWA)

Add a new provider alongside the existing ones:

```ts
export class OpenWaProvider implements EspProvider {
  name = "openwa";
  async send(msg: OutboundMessage): Promise<DispatchOutcome> {
    const res = await fetch(`${process.env.OPENWA_BASE_URL}/api/sessions/${process.env.OPENWA_SESSION_ID}/messages/send-text`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENWA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: msg.to, text: msg.body }),
    });
    return res.ok ? { ok: true, providerRef: (await res.json()).id } : { ok: false, error: await res.text() };
  }
}
```

Register it as `PROVIDERS.whatsapp = new OpenWaProvider()`, and teach `messageOutbox.channel` to recognize `"whatsapp"` as a value.

New env vars needed: `OPENWA_BASE_URL`, `OPENWA_API_KEY` (an OpenWA-issued API key, see its `AuthService` auth model), `OPENWA_SESSION_ID` (the paired WhatsApp session to send from — see §7, session creation/pairing is a separate, manual, one-time step).

Confirmed real endpoint on the OpenWA side: `POST /api/sessions/:sessionId/messages/send-text` (`src/modules/message/message.controller.ts`), API-key-authenticated.

## 5. Proposed design — inbound (OpenWA → LRMCRM)

New route `src/app/api/whatsapp/webhook/route.ts`, mirroring the existing `src/app/api/pos/webhook/route.ts` pattern almost exactly (same repo, same file for reference): read the raw body, verify an HMAC-SHA256 signature with `timingSafeEqual`, parse/validate, then handle.

The one concrete difference from the POS webhook: OpenWA signs its webhook deliveries as **`X-OpenWA-Signature: sha256=<hex>`** (confirmed in `src/modules/webhook/webhook.service.ts` on the OpenWA side — note the `sha256=` prefix on the header value, unlike LRMCRM's own `x-loya-signature` header on the POS route which has no prefix), computed over the raw body with the webhook's own `secret` (configured when registering the webhook via OpenWA's `POST /api/sessions/:sessionId/webhooks`, not the same secret as `POS_WEBHOOK_SECRET`). Events to expect: `message.received`, `message.ack`, `message.failed`, and others per OpenWA's `docs/06-api-specification.md`.

## 6. What this note is *not*

- Not a monorepo merge. OpenWA and LRMCRM stay separate repos/deployments.
- Not a code-level embedding of OpenWA inside the Next.js app.
- Not an implementation — no provider class, no webhook route, and no env vars have been added to the codebase yet. This is the design to implement against once that work is greenlit.

## 7. Open items — deferred to the actual implementation phase

- **Session ownership**: who creates and pairs (QR-scans) the WhatsApp session LRMCRM will send from, and on what phone number/account. Inherently a manual, human, one-time step (see OpenWA's `docs/local-dev-sandbox-notes.md`, §5).
- **Retry/backoff** on `OpenWaProvider.send()` — `dispatch.ts`'s existing outbox-drain loop should be checked for what retry semantics it already assumes from a provider.
- **Mapping inbound events** (`message.received` etc.) onto LRMCRM's existing automation engine (`src/modules/automation/engine.ts`) — e.g. does an inbound WhatsApp reply need to feed lead scoring, loyalty triggers, both, neither?
- **Secrets management**: `OPENWA_API_KEY` (and the webhook secret) need to land in Vercel's env var config for deployed environments — not just local `.env`.
- **Multi-tenancy**: `getProvider()` is already org-scoped (`org_settings.espProvider`) — decide whether all orgs share one OpenWA session/number or each org needs its own `OPENWA_SESSION_ID`.

## 8. Related

- [`docs/local-dev-sandbox-notes.md`](./local-dev-sandbox-notes.md) (this repo) — running LRMCRM locally.
- `docs/local-dev-sandbox-notes.md` in the OpenWA repo — running OpenWA locally, including why real WhatsApp pairing can't be done in a sandbox.
