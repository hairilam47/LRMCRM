import { and, eq, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getProvider } from "./providers";

const { messageOutbox, loyaltyMembers, contacts } = schema;

/**
 * Drains queued outbox rows whose scheduledFor has passed (or is null =
 * immediate) through the org's configured provider (Settings → ESP
 * provider). This is the seam: implement a real EspProvider in providers.ts
 * and this function needs no changes.
 */
export async function dispatchOutbox(orgId: string, limit = 50) {
  const db = await getDb();
  const provider = await getProvider(db, orgId);
  const due = await db.select({ msg: messageOutbox, phone: contacts.phone })
    .from(messageOutbox)
    .leftJoin(loyaltyMembers, eq(messageOutbox.memberId, loyaltyMembers.id))
    .leftJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .where(and(
      eq(messageOutbox.orgId, orgId),
      eq(messageOutbox.status, "queued"),
      or(isNull(messageOutbox.scheduledFor), lte(messageOutbox.scheduledFor, new Date())),
    ))
    .limit(limit);

  let sent = 0, failed = 0;
  for (const { msg, phone } of due) {
    const outcome = await provider.send({
      channel: msg.channel, to: phone ?? undefined, subject: msg.subject, body: msg.body,
    });
    await db.update(messageOutbox)
      .set({ status: outcome.ok ? "sent_mock" : "failed" })
      .where(eq(messageOutbox.id, msg.id));
    if (outcome.ok) sent++; else failed++;
  }
  return { sent, failed, remaining: due.length - sent - failed, provider: provider.name };
}
