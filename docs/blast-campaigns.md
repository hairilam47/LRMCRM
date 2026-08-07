# WhatsApp Blast Campaigns

How to configure and use the blast feature (`/loyalty/marketing/blast`) — sending a message, optional media, and optionally AI-drafted copy to a segment of opted-in loyalty members via WhatsApp. See [`docs/integration-openwa-whatsapp.md`](./integration-openwa-whatsapp.md) for the underlying OpenWA integration design; this doc is the operator-facing how-to.

## 1. Prerequisites

1. **A running, paired OpenWA instance** — see OpenWA's own `docs/local-dev-sandbox-notes.md` for standing it up, and its main README for pairing a real WhatsApp number (QR scan — inherently a manual, human step, cannot be automated).
2. **Env vars set** in LRMCRM (`.env` locally, Vercel env vars in production):
   - `OPENWA_BASE_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID` — required to send anything.
   - `OPENWA_WEBHOOK_SECRET` — required if you register a webhook (recommended in production, so delivery/read status and opt-out replies flow back). Without it, `/api/whatsapp/webhook` still works but accepts unsigned requests.
   - `ANTHROPIC_API_KEY` — optional. Without it, the composer's "Generate draft" button simply doesn't appear; you write copy manually.
3. **Register the inbound webhook** on the OpenWA side once, pointed at `https://<your-deployment>/api/whatsapp/webhook`:
   ```
   POST /api/sessions/:sessionId/webhooks
   { "url": "https://your-app/api/whatsapp/webhook",
     "events": ["message.ack", "message.failed", "message.received"],
     "secret": "<same value as OPENWA_WEBHOOK_SECRET>" }
   ```

## 2. Consent — the audience gate

**Blasts only ever target contacts with `wa_consent = true`.** There's no way to send around this from the composer — it's enforced in `src/modules/blast/audience.ts`, not left to the caller. New contacts default to `false`.

- Opt a member in/out from their detail page (`/loyalty/members/:id`) — a "WhatsApp marketing" card with an Opt in / Opt out toggle.
- A member also self-opts-out by replying `STOP`, `UNSUBSCRIBE`, `BERHENTI`, or `OPT OUT` to any WhatsApp message from your number — handled automatically by the inbound webhook.
- The composer's audience preview shows, live, how many of a segment are opted in vs. excluded (no consent, or no phone number on file) — so a marketer sees the real reach before sending, not after.

This exists because unsolicited bulk WhatsApp messaging is explicitly the top way to get a business number restricted (per OpenWA's own README, and WhatsApp Business Policy) — the audience gate is load-bearing, not a formality.

## 3. Composing a blast

1. Go to **Loyalty → Marketing → Blast**.
2. Pick a **segment**: all members, a single tier, or lapsed 30+ days (same segments as the Vouchers bulk-campaign feature).
3. Optionally enter a **brief** and click **Generate draft** (only shown if `ANTHROPIC_API_KEY` is set) — Claude drafts a short WhatsApp-appropriate message using the brief and segment as context. Always review/edit before sending; nothing is ever sent without a human clicking Send.
4. Write or edit the **message**. Merge fields: `{{name}}`, `{{first_name}}`, `{{tier}}`, `{{points}}` — substituted per recipient at send time. Unknown/misspelled tokens are left literal (visibly wrong beats silently blank).
5. Optionally add a **media URL** — a public image link. OpenWA fetches it server-side; no upload step exists in LRMCRM today (a deliberate v1 scope cut — see `docs/integration-openwa-whatsapp.md` §7 for the tradeoff).
6. Click **Send**. The campaign is recorded immediately (`blast_campaigns` + one `message_outbox` row per recipient), chunked into batches of ≤100, and handed to OpenWA's `send-bulk` endpoint. OpenWA paces delivery server-side — the send action returns as soon as the batch(es) are *accepted*, not once every message is actually delivered.

## 4. After sending

- **Recent campaigns** (right side of the blast page) shows each campaign's status and `sent/total` count.
- **Message outbox** (`/loyalty/marketing/outbox`) shows individual recipient rows, including per-recipient status. `sent` means "handed to OpenWA" — it advances to `delivered`/`read` asynchronously as the inbound webhook receives `message.ack` events. A row stuck at `sent` for a while doesn't necessarily mean failure — WhatsApp only reports `delivered` once the recipient's device comes online.
- Every send is audited (`audit_log`, `action: "blast.send"`) with the segment, counts, and whether media was attached.

## 5. Known v1 scope cuts (see `docs/integration-openwa-whatsapp.md` §7 for the full list)

- **No file upload** — media must already be hosted at a public URL.
- **Global credentials, not per-org** — one shared WhatsApp number for the whole deployment.
- **No scheduled/recurring blasts** — sending is always immediate, triggered by a click (matches the rest of this codebase's on-demand-only automation model — see `runWinbackSweep`/`dispatchOutbox`).
- **No A/B testing or per-recipient personalization beyond merge fields.**
