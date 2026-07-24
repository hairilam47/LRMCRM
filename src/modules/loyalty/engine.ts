import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { writeAudit } from "@/modules/audit/log";

type Tx = any; // drizzle transaction handle (postgres-js | pglite share the API we use)

const {
  loyaltyPrograms, loyaltyTiers, loyaltyMembers, pointsLedger, walletLedger,
  stampCards, stampProgress, vouchers, voucherIssuances,
} = schema;

/** Manual staff adjustment — always logged with a required reason, both directions. */
/** Manual staff adjustment — always logged with a required reason, both directions, and audited with actor identity. */
export async function adjustPoints(db: any, memberId: string, delta: number, reason: string, actorId?: string) {
  if (delta === 0) throw new Error("Adjustment must be non-zero");
  const [member] = await db.select().from(loyaltyMembers).where(eq(loyaltyMembers.id, memberId));
  await db.insert(pointsLedger).values({
    memberId, delta, reason: "adjust", note: reason || "Manual adjustment",
  });
  if (member) {
    await writeAudit(db, {
      orgId: member.orgId, actorId, action: "points.adjust", entityType: "member", entityId: memberId,
      detail: { delta, reason },
    });
  }
}

export async function adjustWallet(db: any, memberId: string, deltaSen: number, reason: string, actorId?: string) {
  if (deltaSen === 0) throw new Error("Adjustment must be non-zero");
  const [member] = await db.select().from(loyaltyMembers).where(eq(loyaltyMembers.id, memberId));
  await db.insert(walletLedger).values({
    memberId, deltaSen, reason: "adjust", note: reason || "Manual adjustment",
  });
  if (member) {
    await writeAudit(db, {
      orgId: member.orgId, actorId, action: "wallet.adjust", entityType: "member", entityId: memberId,
      detail: { deltaSen, reason },
    });
  }
}

export type LineItemInput = { sku: string; name: string; category?: string; qty: number; unitPriceSen: number };

export type RewardsResult = {
  pointsEarned: number;
  basePoints: number;
  tierMultiplierPct: number;
  cashbackSen: number;
  stamps: { cardName: string; added: number; count: number; goal: number; completed: boolean; rewardLabel?: string }[];
  newPointsBalance: number;
  walletBalanceSen: number;
  tier: { name: string; changed: boolean; newTier?: string };
};

/** Balance is always derived from the ledger — never stored. */
export async function pointsBalance(tx: Tx, memberId: string): Promise<number> {
  const [row] = await tx
    .select({ bal: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)` })
    .from(pointsLedger)
    .where(eq(pointsLedger.memberId, memberId));
  return Number(row?.bal ?? 0);
}

export async function walletBalanceSen(tx: Tx, memberId: string): Promise<number> {
  const [row] = await tx
    .select({ bal: sql<number>`coalesce(sum(${walletLedger.deltaSen}), 0)` })
    .from(walletLedger)
    .where(eq(walletLedger.memberId, memberId));
  return Number(row?.bal ?? 0);
}

/**
 * Applies a completed POS transaction to a member: points, cashback,
 * stamps, tier re-evaluation. Runs inside the caller's transaction so a
 * failure anywhere rolls back the whole ingestion atomically.
 */
export async function applyRewards(
  tx: Tx,
  opts: { memberId: string; posTransactionId: string; netSen: number; lineItems: LineItemInput[] }
): Promise<RewardsResult> {
  const { memberId, posTransactionId, netSen, lineItems } = opts;

  const [member] = await tx.select().from(loyaltyMembers).where(eq(loyaltyMembers.id, memberId));
  if (!member) throw new Error("member not found");
  const [program] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.id, member.programId));
  const tiers = await tx.select().from(loyaltyTiers)
    .where(eq(loyaltyTiers.programId, member.programId))
    .orderBy(loyaltyTiers.position);
  const currentTier = tiers.find((t: any) => t.id === member.tierId) ?? tiers[0];

  /* ---- 1. Points: net(RM) × earnRate × tier multiplier ---- */
  const basePoints = Math.round((netSen / 100) * program.earnRatePerRm);
  const pointsEarned = Math.round(basePoints * (currentTier.multiplierPct / 100));
  if (pointsEarned > 0) {
    await tx.insert(pointsLedger).values({
      memberId, delta: pointsEarned, reason: "earn",
      note: `Purchase · net RM ${(netSen / 100).toFixed(2)}${currentTier.multiplierPct !== 100 ? ` · ${currentTier.name} ×${(currentTier.multiplierPct / 100).toFixed(1)}` : ""}`,
      posTransactionId,
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    });
  }

  /* ---- 2. Cashback into wallet ---- */
  const cashbackSen = Math.round((netSen * program.cashbackBps) / 10_000);
  if (cashbackSen > 0) {
    await tx.insert(walletLedger).values({
      memberId, deltaSen: cashbackSen, reason: "cashback",
      note: `${(program.cashbackBps / 100).toFixed(0)}% cashback`, posTransactionId,
    });
  }

  /* ---- 3. Stamp cards ---- */
  const cards = await tx.select().from(stampCards)
    .where(and(eq(stampCards.programId, member.programId), eq(stampCards.active, true)));
  const stampResults: RewardsResult["stamps"] = [];
  for (const card of cards) {
    const qualifying = lineItems
      .filter((li) => li.category === card.qualifyingCategory)
      .reduce((s, li) => s + li.qty, 0);
    let [prog] = await tx.select().from(stampProgress)
      .where(and(eq(stampProgress.stampCardId, card.id), eq(stampProgress.memberId, memberId)));
    if (!prog) {
      [prog] = await tx.insert(stampProgress)
        .values({ stampCardId: card.id, memberId, count: 0 }).returning();
    }
    if (qualifying === 0) {
      stampResults.push({ cardName: card.name, added: 0, count: prog.count, goal: card.goal, completed: false });
      continue;
    }
    let count = prog.count + qualifying;
    let completed = false;
    let cycles = prog.completedCycles;
    if (count >= card.goal) {
      completed = true;
      cycles += Math.floor(count / card.goal);
      count = count % card.goal;
      // reward: issue a free-item voucher on completion
      let [freeVoucher] = await tx.select().from(vouchers)
        .where(and(eq(vouchers.orgId, member.orgId), eq(vouchers.name, card.rewardLabel)));
      if (!freeVoucher) {
        [freeVoucher] = await tx.insert(vouchers).values({
          orgId: member.orgId, name: card.rewardLabel, kind: "free_item",
          valueSen: 0, minSpendSen: 0, validDays: 30,
        }).returning();
      }
      await tx.insert(voucherIssuances).values({
        voucherId: freeVoucher.id, memberId,
        sourceNote: `${card.name} stamp card completed`,
        expiresAt: new Date(Date.now() + freeVoucher.validDays * 24 * 3600 * 1000),
      });
    }
    await tx.update(stampProgress)
      .set({ count, completedCycles: cycles, updatedAt: new Date() })
      .where(eq(stampProgress.id, prog.id));
    stampResults.push({
      cardName: card.name, added: qualifying, count, goal: card.goal,
      completed, rewardLabel: completed ? card.rewardLabel : undefined,
    });
  }

  /* ---- 4. Rollup caches + tier evaluation ---- */
  const annualSpendSen = member.annualSpendSen + netSen;
  const ltvSen = member.ltvSen + netSen;
  const totalVisits = member.totalVisits + 1;
  const eligible = [...tiers].reverse().find((t: any) => annualSpendSen >= t.minAnnualSpendSen) ?? tiers[0];
  const tierChanged = eligible.id !== currentTier.id;
  await tx.update(loyaltyMembers).set({
    ltvSen, annualSpendSen, totalVisits,
    aovSen: Math.round(ltvSen / totalVisits),
    lastVisitAt: new Date(),
    tierId: eligible.id,
  }).where(eq(loyaltyMembers.id, memberId));

  if (tierChanged) {
    await tx.insert(pointsLedger).values({
      memberId, delta: 0, reason: "tier_bonus",
      note: `Tier upgraded: ${currentTier.name} → ${eligible.name}`, posTransactionId,
    });
  }

  return {
    pointsEarned, basePoints, tierMultiplierPct: currentTier.multiplierPct,
    cashbackSen,
    stamps: stampResults,
    newPointsBalance: await pointsBalance(tx, memberId),
    walletBalanceSen: await walletBalanceSen(tx, memberId),
    tier: { name: eligible.name, changed: tierChanged, newTier: tierChanged ? eligible.name : undefined },
  };
}

/** Member ledger views for the detail page */
export async function memberLedgers(db: any, memberId: string) {
  const points = await db.select().from(pointsLedger)
    .where(eq(pointsLedger.memberId, memberId))
    .orderBy(desc(pointsLedger.createdAt)).limit(30);
  const wallet = await db.select().from(walletLedger)
    .where(eq(walletLedger.memberId, memberId))
    .orderBy(desc(walletLedger.createdAt)).limit(30);
  return { points, wallet };
}
