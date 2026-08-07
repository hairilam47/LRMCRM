import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { messageOutbox, contacts } = schema;

/**
 * POST /api/whatsapp/webhook — receives event deliveries from OpenWA
 * (see docs/integration-openwa-whatsapp.md). Mirrors src/app/api/pos/
 * webhook/route.ts's HMAC-verification shape, with two differences:
 *  1. OpenWA signs as `X-OpenWA-Signature: sha256=<hex>` (prefixed), not
 *     the bare hex LRMCRM's own POS webhook uses.
 *  2. Verification is required whenever OPENWA_WEBHOOK_SECRET is set,
 *     rather than only-if-a-signature-is-present. Unlike the POS route,
 *     which intentionally also accepts unsigned requests from its
 *     built-in simulator, this endpoint has exactly one legitimate
 *     caller (OpenWA) and mutates data (delivery status, consent) — an
 *     unsigned request should be rejected outright once a secret exists,
 *     not silently trusted. Only skipped when no secret is configured at
 *     all (local dev without a webhook wired up yet).
 *
 * Handles:
 *  - message.ack / message.failed  -> advance the matching message_outbox
 *    row's status (sent -> delivered -> read, or -> failed), correlated by
 *    the chatId embedded in OpenWA's messageId ("<fromMe>_<chatId>_<id>").
 *  - message.received  -> opt-out handling: a reply body of "stop" /
 *    "unsubscribe" (case-insensitive, trimmed) flips contacts.waConsent to
 *    false for that phone number. This is the one inbound signal every
 *    WhatsApp Business sender is expected to honor.
 * All other subscribed events are accepted (200) and ignored — OpenWA's
 * webhook delivery is at-least-once with retry, so an unrecognized event
 * type must not be treated as an error.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  const secret = process.env.OPENWA_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("x-openwa-signature");
    if (!sig) {
      return NextResponse.json({ error: "missing signature" }, { status: 401 });
    }
    const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const envelope = body as { event?: string; data?: Record<string, unknown> };
  const event = envelope.event;
  const data = envelope.data ?? {};

  try {
    if (event === "message.ack" || event === "message.failed") {
      await handleAck(data);
    } else if (event === "message.received") {
      await handleInbound(data);
    }
    // Any other subscribed event (session.status, message.sent, etc.) is
    // accepted and intentionally not acted on yet.
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Still 200 — this is a best-effort status update, not a transaction
    // OpenWA should retry. Log server-side for visibility instead.
    console.error("[whatsapp webhook] handler error:", (e as Error).message);
    return NextResponse.json({ ok: true, warning: "handled with errors" });
  }
}

/** Extracts the chatId OpenWA embeds in its messageId, e.g. "true_628123456789@c.us_3EB0ABCD" -> "628123456789@c.us". */
function chatIdFromMessageId(messageId: string | undefined): string | null {
  if (!messageId) return null;
  const parts = messageId.split("_");
  return parts.length >= 2 ? parts[1] || null : null;
}

async function handleAck(data: Record<string, unknown>) {
  const messageId = data.messageId as string | undefined;
  const ackStatus = data.status as string | undefined; // pending | sent | delivered | read | failed
  const chatId = chatIdFromMessageId(messageId);
  if (!chatId) return;

  const newStatus = ackStatus === "read" ? "read" : ackStatus === "delivered" ? "delivered" : ackStatus === "failed" ? "failed" : null;
  if (!newStatus) return; // "pending"/"sent" acks don't move our already-"sent" row backward

  const db = await getDb();
  const candidates = await db.select({ id: messageOutbox.id })
    .from(messageOutbox)
    .where(and(
      eq(messageOutbox.channel, "whatsapp"),
      eq(messageOutbox.toChatId, chatId),
      inArray(messageOutbox.status, ["sent", "delivered"]), // monotonic: don't un-read a read message
    ));
  if (candidates.length === 0) return;

  await db.update(messageOutbox)
    .set({
      status: newStatus,
      providerRef: messageId ?? undefined,
      error: newStatus === "failed" ? (data.error as string | undefined) ?? "delivery failed" : null,
    })
    .where(inArray(messageOutbox.id, candidates.map((c: { id: string }) => c.id)));
}

const OPT_OUT_KEYWORDS = new Set(["stop", "unsubscribe", "berhenti", "opt out", "optout"]);

async function handleInbound(data: Record<string, unknown>) {
  const from = data.from as string | undefined; // e.g. "628123456789@c.us"
  const messageBody = (data.body as string | undefined)?.trim().toLowerCase();
  if (!from || !messageBody || !OPT_OUT_KEYWORDS.has(messageBody)) return;

  const digits = from.split("@")[0];
  if (!digits) return;

  const db = await getDb();
  // contacts.phone is free-text (no normalization on write) — match by
  // digit suffix, same tolerance the rest of the codebase uses for phone
  // lookups (see loyalty/vouchers/page.tsx's whitespace/dash stripping).
  const rows = await db.select({ id: contacts.id, phone: contacts.phone }).from(contacts);
  const match = rows.find((c: { id: string; phone: string | null }) => c.phone && c.phone.replace(/\D/g, "").endsWith(digits.slice(-8)));
  if (!match) return;

  await db.update(contacts).set({ waConsent: false, waConsentAt: new Date() }).where(eq(contacts.id, match.id));
}
