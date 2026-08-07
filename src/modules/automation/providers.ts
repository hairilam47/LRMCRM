/**
 * ESP provider abstraction. Swap MockProvider for a real one (Twilio, SNS,
 * Resend, etc.) by implementing this interface and adding it to `PROVIDERS`
 * below — nothing else in the codebase changes. The active choice is stored
 * per-org (Settings → not yet in UI beyond this switch) and resolved at
 * dispatch time via getProvider().
 */
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { toWhatsAppChatId } from "@/lib/phone";

export type OutboundMessage = {
  channel: string; to?: string; subject?: string | null; body: string; mediaUrl?: string | null;
};
export type DispatchOutcome = { ok: boolean; providerRef?: string; error?: string };

export interface EspProvider {
  name: string;
  send(msg: OutboundMessage): Promise<DispatchOutcome>;
}

/** Default for local/demo use — always succeeds, logs nothing external. */
export class MockProvider implements EspProvider {
  name = "mock";
  async send(msg: OutboundMessage): Promise<DispatchOutcome> {
    return { ok: true, providerRef: `mock_${Date.now().toString(36)}` };
  }
}

/** Useful in dev to see exactly what would have gone out. */
export class ConsoleProvider implements EspProvider {
  name = "console";
  async send(msg: OutboundMessage): Promise<DispatchOutcome> {
    console.log(`[ESP:console] ${msg.channel} → ${msg.to ?? "?"}: ${msg.subject ? `${msg.subject} — ` : ""}${msg.body}`);
    return { ok: true, providerRef: `console_${Date.now().toString(36)}` };
  }
}

/**
 * Real WhatsApp send via OpenWA (github.com/hairilam47/OpenWA — a self-hosted
 * NestJS WhatsApp API gateway, run as its own always-on service; see
 * docs/integration-openwa-whatsapp.md for why it can't live inside this
 * Vercel deployment). Single-message sends only — for bulk campaigns, use
 * src/modules/blast, which calls OpenWA's POST .../messages/send-bulk
 * directly instead of looping this one message at a time.
 *
 * Required env vars: OPENWA_BASE_URL, OPENWA_API_KEY (an OPERATOR-role key,
 * scoped to OPENWA_SESSION_ID only), OPENWA_SESSION_ID (a session already
 * paired to a real WhatsApp number — pairing is a manual, human, one-time
 * step; see OpenWA's docs/local-dev-sandbox-notes.md).
 */
export class OpenWaProvider implements EspProvider {
  name = "openwa";
  async send(msg: OutboundMessage): Promise<DispatchOutcome> {
    const baseUrl = process.env.OPENWA_BASE_URL;
    const apiKey = process.env.OPENWA_API_KEY;
    const sessionId = process.env.OPENWA_SESSION_ID;
    if (!baseUrl || !apiKey || !sessionId) {
      return { ok: false, error: "OpenWA not configured — set OPENWA_BASE_URL, OPENWA_API_KEY, OPENWA_SESSION_ID" };
    }

    const chatId = toWhatsAppChatId(msg.to);
    if (!chatId) return { ok: false, error: `No usable phone number for recipient (got: ${msg.to ?? "none"})` };

    const endpoint = msg.mediaUrl ? "send-image" : "send-text";
    const body = msg.mediaUrl
      ? { chatId, url: msg.mediaUrl, caption: msg.body || undefined }
      : { chatId, text: msg.body };

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return { ok: false, error: `OpenWA unreachable: ${(e as Error).message}` };
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return { ok: false, error: `OpenWA ${res.status}: ${detail.slice(0, 500)}` };
    }

    const json = (await res.json()) as { messageId?: string };
    return { ok: true, providerRef: json.messageId };
  }
}

/**
 * Production swap — NOT wired up (no credentials in this environment).
 * To go live: implement this class, add it to PROVIDERS below, set the
 * required env vars, and switch the org's provider in Settings.
 *
 * Required env vars for a real Twilio integration:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * export class TwilioProvider implements EspProvider {
 *   name = "twilio";
 *   async send(msg: OutboundMessage): Promise<DispatchOutcome> {
 *     const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
 *       method: "POST",
 *       headers: {
 *         Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
 *         "Content-Type": "application/x-www-form-urlencoded",
 *       },
 *       body: new URLSearchParams({ To: msg.to ?? "", From: process.env.TWILIO_FROM_NUMBER ?? "", Body: msg.body }),
 *     });
 *     return res.ok ? { ok: true, providerRef: (await res.json()).sid } : { ok: false, error: await res.text() };
 *   }
 * }
 */

export const PROVIDERS: Record<string, EspProvider> = {
  mock: new MockProvider(),
  console: new ConsoleProvider(),
  openwa: new OpenWaProvider(),
};

/** Back-compat default for anything not org-aware yet. */
export const activeProvider: EspProvider = PROVIDERS.mock;

export async function getProvider(db: any, orgId: string): Promise<EspProvider> {
  const [row] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  return PROVIDERS[row?.espProvider ?? "mock"] ?? PROVIDERS.mock;
}
