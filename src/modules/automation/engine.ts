import { and, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { LineItemInput, RewardsResult } from "@/modules/loyalty/engine";

const {
  automationRules, messageOutbox, posLineItems, posTransactions,
  loyaltyMembers, contacts, vouchers, voucherIssuances,
} = schema;

export type AutomationOutcome = {
  rule: string;
  fired: boolean;
  detail: string;
  channel?: string;
};

/**
 * Evaluates active `pos.completed` rules inside the ingestion transaction.
 * Actions write to message_outbox / voucher_issuances — the Phase-2 seam
 * where a real queue + ESP dispatcher takes over.
 */
export async function runPosAutomations(
  tx: any,
  ctx: {
    orgId: string;
    member: typeof loyaltyMembers.$inferSelect;
    contactName: string;
    lineItems: LineItemInput[];
    rewards: RewardsResult;
    posTransactionId: string;
  }
): Promise<AutomationOutcome[]> {
  const rules = await tx.select().from(automationRules)
    .where(and(
      eq(automationRules.orgId, ctx.orgId),
      eq(automationRules.trigger, "pos.completed"),
      eq(automationRules.active, 1),
    ));

  const outcomes: AutomationOutcome[] = [];

  for (const rule of rules) {
    const cond = (rule.condition ?? {}) as Record<string, any>;
    const action = (rule.action ?? {}) as Record<string, any>;

    /* ---- post-visit thank you (no condition) ---- */
    if (!cond.boughtCategory) {
      const body = render(action.template ?? "Thanks for visiting! You earned {points} points.", ctx);
      await tx.insert(messageOutbox).values({
        orgId: ctx.orgId, memberId: ctx.member.id,
        channel: action.channel ?? "sms", body,
        ruleName: rule.name,
        scheduledFor: new Date(Date.now() + (action.delayMinutes ?? 15) * 60_000),
      });
      outcomes.push({ rule: rule.name, fired: true, channel: action.channel ?? "sms", detail: `queued · sends in ${action.delayMinutes ?? 15} min` });
      continue;
    }

    /* ---- cross-sell: bought category A, never bought category B ---- */
    const boughtNow = ctx.lineItems.some((li) => li.category === cond.boughtCategory && li.qty > 0);
    if (!boughtNow) {
      outcomes.push({ rule: rule.name, fired: false, detail: `no ${cond.boughtCategory} in basket — skipped` });
      continue;
    }
    const inBasketNever = ctx.lineItems.some((li) => li.category === cond.neverCategory && li.qty > 0);
    if (inBasketNever) {
      outcomes.push({ rule: rule.name, fired: false, detail: `${cond.neverCategory} already in basket — skipped` });
      continue;
    }
    // any historical purchase of the never-category?
    const [prior] = await tx.select({ n: sql<number>`count(*)` })
      .from(posLineItems)
      .innerJoin(posTransactions, eq(posLineItems.transactionId, posTransactions.id))
      .where(and(
        eq(posTransactions.memberId, ctx.member.id),
        eq(posLineItems.category, cond.neverCategory),
      ));
    if (Number(prior?.n ?? 0) > 0) {
      outcomes.push({ rule: rule.name, fired: false, detail: `has bought ${cond.neverCategory} before — skipped` });
      continue;
    }
    // fire: issue voucher + push
    const [voucher] = await tx.select().from(vouchers)
      .where(and(eq(vouchers.orgId, ctx.orgId), eq(vouchers.name, action.voucherName)));
    if (voucher) {
      await tx.insert(voucherIssuances).values({
        voucherId: voucher.id, memberId: ctx.member.id,
        sourceNote: `${rule.name} (cross-sell trigger)`,
        expiresAt: new Date(Date.now() + voucher.validDays * 24 * 3600 * 1000),
      });
    }
    await tx.insert(messageOutbox).values({
      orgId: ctx.orgId, memberId: ctx.member.id, channel: "push",
      body: render(action.template ?? "A treat is waiting in your wallet: {voucher}", { ...ctx, voucherName: action.voucherName }),
      ruleName: rule.name,
    });
    outcomes.push({ rule: rule.name, fired: true, channel: "push", detail: `voucher issued: ${action.voucherName}` });
  }

  return outcomes;
}

/**
 * Win-back sweep (§8.3.2) — invoked manually from the Outbox screen in the
 * prototype; a cron/queue worker in production. Members lapsed > N days get
 * a voucher dropped into their wallet + a push notification.
 */
export async function runWinbackSweep(db: any, orgId: string): Promise<{ swept: number }> {
  const [rule] = await db.select().from(automationRules)
    .where(and(
      eq(automationRules.orgId, orgId),
      eq(automationRules.trigger, "member.lapsed"),
      eq(automationRules.active, 1),
    ));
  if (!rule) return { swept: 0 };
  const cond = (rule.condition ?? {}) as Record<string, any>;
  const action = (rule.action ?? {}) as Record<string, any>;
  const cutoff = new Date(Date.now() - (cond.lapsedDays ?? 30) * 24 * 3600 * 1000);

  const lapsed = await db.select().from(loyaltyMembers)
    .where(and(
      eq(loyaltyMembers.orgId, orgId),
      isNotNull(loyaltyMembers.lastVisitAt),
      lt(loyaltyMembers.lastVisitAt, cutoff),
    ));
  if (lapsed.length === 0) return { swept: 0 };

  // skip anyone already holding an unexpired issuance of the win-back voucher
  const [voucher] = await db.select().from(vouchers)
    .where(and(eq(vouchers.orgId, orgId), eq(vouchers.name, action.voucherName)));

  let swept = 0;
  for (const m of lapsed) {
    if (voucher) {
      const existing = await db.select().from(voucherIssuances)
        .where(and(
          eq(voucherIssuances.memberId, m.id),
          eq(voucherIssuances.voucherId, voucher.id),
          eq(voucherIssuances.status, "issued"),
          gt(voucherIssuances.expiresAt, new Date()),
        ));
      if (existing.length > 0) continue;
      await db.insert(voucherIssuances).values({
        voucherId: voucher.id, memberId: m.id,
        sourceNote: "win-back sweep",
        expiresAt: new Date(Date.now() + (voucher.validDays ?? 7) * 24 * 3600 * 1000),
      });
    }
    await db.insert(messageOutbox).values({
      orgId, memberId: m.id, channel: "push",
      body: action.template ?? "We miss you! A voucher is waiting in your wallet — valid 7 days.",
      ruleName: rule.name,
    });
    swept++;
  }
  return { swept };
}

function render(template: string, ctx: any): string {
  return template
    .replace("{name}", ctx.contactName ?? "")
    .replace("{points}", String(ctx.rewards?.pointsEarned ?? ""))
    .replace("{points_value}", ctx.rewards ? `RM ${((ctx.rewards.pointsEarned * 10) / 100).toFixed(2)}` : "")
    .replace("{balance}", String(ctx.rewards?.newPointsBalance ?? ""))
    .replace("{voucher}", ctx.voucherName ?? "");
}
