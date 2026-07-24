/**
 * ESP provider abstraction. Swap MockProvider for a real one (Twilio, SNS,
 * Resend, etc.) by implementing this interface and adding it to `PROVIDERS`
 * below — nothing else in the codebase changes. The active choice is stored
 * per-org (Settings → not yet in UI beyond this switch) and resolved at
 * dispatch time via getProvider().
 */
import { eq } from "drizzle-orm";
import { schema } from "@/db";

export type OutboundMessage = { channel: string; to?: string; subject?: string | null; body: string };
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
};

/** Back-compat default for anything not org-aware yet. */
export const activeProvider: EspProvider = PROVIDERS.mock;

export async function getProvider(db: any, orgId: string): Promise<EspProvider> {
  const [row] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  return PROVIDERS[row?.espProvider ?? "mock"] ?? PROVIDERS.mock;
}
