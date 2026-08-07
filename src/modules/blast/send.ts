import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { writeAudit } from "@/modules/audit/log";
import { toWhatsAppChatId } from "@/lib/phone";
import { resolveBlastAudience, type BlastSegment } from "./audience";
import { renderMergeFields, mergeContextFor } from "./render";
import { getOpenWaConfig, checkSessionReady, sendBulkBatch, type BulkItem } from "./openwa-client";

const { blastCampaigns, messageOutbox } = schema;

/** OpenWA's send-bulk hard cap (BulkMessageItemDto @ArrayMaxSize) — chunk larger audiences. */
const MAX_PER_BATCH = 100;

export type SendBlastInput = {
  orgId: string;
  name: string;
  segment: BlastSegment;
  body: string; // may contain {{name}} / {{first_name}} / {{tier}} / {{points}}
  mediaUrl?: string | null;
  actorId?: string;
};

export type SendBlastOutcome =
  | {
      ok: true; campaignId: string; audienceSize: number; sent: number; failed: number;
      excludedNoConsent: number; excludedNoPhone: number;
    }
  | { ok: false; error: string };

/**
 * Resolves the consenting audience, renders per-recipient content, and fans
 * out through OpenWA's send-bulk endpoint in chunks of <=100. Writes one
 * message_outbox row per recipient up front (status "queued") so the
 * attempt is auditable even if a later chunk's HTTP call fails outright —
 * then advances each chunk's rows to "sent"/"failed" once OpenWA responds.
 * Final per-recipient delivery/read status arrives later via the inbound
 * webhook (src/app/api/whatsapp/webhook/route.ts), correlated by
 * providerRef.
 */
export async function sendBlast(input: SendBlastInput): Promise<SendBlastOutcome> {
  const cfg = getOpenWaConfig();
  if (!cfg) return { ok: false, error: "OpenWA is not configured — set OPENWA_BASE_URL, OPENWA_API_KEY, OPENWA_SESSION_ID." };

  const ready = await checkSessionReady(cfg);
  if (!ready.ready) {
    return {
      ok: false,
      error: `OpenWA session isn't ready to send (status: ${ready.status ?? ready.error ?? "unknown"}). The WhatsApp session needs to be paired (QR scan) before it can send — see OpenWA's docs/local-dev-sandbox-notes.md.`,
    };
  }

  const db = await getDb();
  const audience = await resolveBlastAudience(db, input.orgId, input.segment);
  if (audience.eligible.length === 0) {
    return {
      ok: false,
      error: `No opted-in recipients with a phone number in this segment (${audience.segmentSize} in segment, ${audience.excludedNoConsent} haven't opted in, ${audience.excludedNoPhone} missing a phone number).`,
    };
  }

  const [campaign] = await db.insert(blastCampaigns).values({
    orgId: input.orgId, name: input.name, segment: input.segment, body: input.body,
    mediaUrl: input.mediaUrl ?? null, status: "sending",
    audienceSize: audience.eligible.length, createdBy: input.actorId ?? null,
  }).returning();

  const outboxRows = await db.insert(messageOutbox).values(audience.eligible.map((r) => ({
    orgId: input.orgId, memberId: r.memberId, channel: "whatsapp",
    body: renderMergeFields(input.body, mergeContextFor(r)),
    mediaUrl: input.mediaUrl ?? null,
    toChatId: toWhatsAppChatId(r.phone),
    campaignId: campaign.id, status: "queued" as const,
  }))).returning();

  const sendable: { outboxId: string; item: BulkItem }[] = [];
  const badPhoneOutboxIds: string[] = [];
  for (const row of outboxRows) {
    if (!row.toChatId) { badPhoneOutboxIds.push(row.id); continue; }
    sendable.push({
      outboxId: row.id,
      item: input.mediaUrl
        ? { chatId: row.toChatId, type: "image", content: { image: { url: input.mediaUrl }, caption: row.body } }
        : { chatId: row.toChatId, type: "text", content: { text: row.body } },
    });
  }
  if (badPhoneOutboxIds.length > 0) {
    await db.update(messageOutbox)
      .set({ status: "failed", error: "Phone number could not be normalized to a WhatsApp id" })
      .where(inArray(messageOutbox.id, badPhoneOutboxIds));
  }

  const providerBatchIds: string[] = [];
  let sent = 0, failed = badPhoneOutboxIds.length;

  for (let i = 0; i < sendable.length; i += MAX_PER_BATCH) {
    const chunk = sendable.slice(i, i + MAX_PER_BATCH);
    const result = await sendBulkBatch(cfg, chunk.map((c) => c.item));
    const ids = chunk.map((c) => c.outboxId);
    if (!result.ok) {
      failed += chunk.length;
      await db.update(messageOutbox).set({ status: "failed", error: result.error }).where(inArray(messageOutbox.id, ids));
      continue;
    }
    providerBatchIds.push(result.batchId);
    sent += chunk.length;
    // OpenWA accepted the batch and processes it asynchronously (paced,
    // sequential) — "sent" here means "handed off", not "delivered".
    await db.update(messageOutbox).set({ status: "sent", providerRef: result.batchId }).where(inArray(messageOutbox.id, ids));
  }

  await db.update(blastCampaigns)
    .set({ status: sent > 0 ? "completed" : "failed", sentCount: sent, failedCount: failed, providerBatchIds, sentAt: new Date() })
    .where(eq(blastCampaigns.id, campaign.id));

  await writeAudit(db, {
    orgId: input.orgId, actorId: input.actorId, action: "blast.send", entityType: "blast", entityId: campaign.id,
    detail: {
      segment: input.segment, channel: "whatsapp", hasMedia: !!input.mediaUrl,
      audienceSize: audience.eligible.length, sent, failed,
      excludedNoConsent: audience.excludedNoConsent, excludedNoPhone: audience.excludedNoPhone,
    },
  });

  return {
    ok: true, campaignId: campaign.id, audienceSize: audience.eligible.length, sent, failed,
    excludedNoConsent: audience.excludedNoConsent, excludedNoPhone: audience.excludedNoPhone,
  };
}
