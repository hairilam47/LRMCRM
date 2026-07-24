import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { applyRewards, type RewardsResult } from "@/modules/loyalty/engine";
import { runPosAutomations, type AutomationOutcome } from "@/modules/automation/engine";

const { stores, contacts, loyaltyMembers, posTransactions, posLineItems, guestProfiles } = schema;

export const posWebhookSchema = z.object({
  store_code: z.string(),
  external_ref: z.string(),
  identifier: z.object({
    kind: z.enum(["phone", "qr", "email", "card_hash", "none"]),
    value: z.string().optional().default(""),
  }),
  payment_method: z.string().default("card"),
  gross_sen: z.number().int().positive(),
  tax_sen: z.number().int().min(0).default(0),
  line_items: z.array(z.object({
    sku: z.string(),
    name: z.string(),
    category: z.string().optional(),
    qty: z.number().int().positive(),
    unit_price_sen: z.number().int().min(0),
  })).min(1),
});

export type PosWebhookPayload = z.infer<typeof posWebhookSchema>;

export type IngestResult = {
  transactionId: string;
  externalRef: string;
  matched: boolean;
  member?: { id: string; name: string; tier: string };
  rewards?: RewardsResult;
  automations: AutomationOutcome[];
  netSen: number;
};

/** Resolve an in-store identifier to a loyalty member (§8.1 identifier resolution). */
async function resolveMember(db: any, orgId: string, kind: string, value: string) {
  if (kind === "none" || !value) return null;
  if (kind === "qr") {
    const [m] = await db.select().from(loyaltyMembers)
      .where(and(eq(loyaltyMembers.orgId, orgId), eq(loyaltyMembers.qrToken, value)));
    return m ?? null;
  }
  const norm = kind === "phone" ? value.replace(/[\s-]/g, "") : value.toLowerCase().trim();
  const rows = await db.select({ member: loyaltyMembers, contact: contacts })
    .from(loyaltyMembers)
    .innerJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .where(eq(loyaltyMembers.orgId, orgId));
  for (const r of rows) {
    if (kind === "phone" && (r.contact.phone ?? "").replace(/[\s-]/g, "") === norm) return r.member;
    if (kind === "email" && (r.contact.email ?? "").toLowerCase() === norm) return r.member;
    // card_hash: exact-match only in prototype; fuzzy identity resolution deferred
  }
  return null;
}

/**
 * The money path (plan §3.3). Fully transactional: transaction insert,
 * ledger writes, rollups, tier change, and automation outbox all commit
 * together or not at all.
 */
export async function ingestPosTransaction(payload: PosWebhookPayload): Promise<IngestResult> {
  const db = await getDb();

  const [store] = await db.select().from(stores).where(eq(stores.code, payload.store_code));
  if (!store) throw new Error(`Unknown store_code: ${payload.store_code}`);
  const orgId = store.orgId;

  const member = await resolveMember(db, orgId, payload.identifier.kind, payload.identifier.value ?? "");
  const netSen = payload.gross_sen - payload.tax_sen;

  return db.transaction(async (tx: any) => {
    let guestProfileId: string | undefined;
    if (!member) {
      const [guest] = await tx.insert(guestProfiles)
        .values({ orgId, hint: payload.identifier.value || null }).returning();
      guestProfileId = guest.id;
    }

    const [posTx] = await tx.insert(posTransactions).values({
      orgId,
      storeId: store.id,
      memberId: member?.id ?? null,
      guestProfileId: guestProfileId ?? null,
      externalRef: payload.external_ref,
      identifierUsed: member ? payload.identifier.kind : "none",
      grossSen: payload.gross_sen,
      netSen,
      taxSen: payload.tax_sen,
      paymentMethod: payment(payload.payment_method),
      rawPayload: payload,
    }).returning();

    const lineItems = payload.line_items.map((li) => ({
      sku: li.sku, name: li.name, category: li.category,
      qty: li.qty, unitPriceSen: li.unit_price_sen,
    }));
    await tx.insert(posLineItems).values(
      lineItems.map((li) => ({ ...li, transactionId: posTx.id }))
    );

    if (!member) {
      return {
        transactionId: posTx.id, externalRef: payload.external_ref,
        matched: false, automations: [], netSen,
      };
    }

    const rewards = await applyRewards(tx, {
      memberId: member.id, posTransactionId: posTx.id, netSen, lineItems,
    });

    const [contact] = await tx.select().from(contacts).where(eq(contacts.id, member.contactId));
    const automations = await runPosAutomations(tx, {
      orgId, member, contactName: contact?.name ?? "Member",
      lineItems, rewards, posTransactionId: posTx.id,
    });

    return {
      transactionId: posTx.id,
      externalRef: payload.external_ref,
      matched: true,
      member: { id: member.id, name: contact?.name ?? "Member", tier: rewards.tier.name },
      rewards,
      automations,
      netSen,
    };
  });
}

function payment(v: string) {
  return ["card", "cash", "ewallet", "qr_pay"].includes(v) ? v : "card";
}
