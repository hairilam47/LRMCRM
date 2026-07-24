import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pointsBalance } from "./engine";
import { writeAudit } from "@/modules/audit/log";

const {
  contacts, loyaltyMembers, loyaltyPrograms, loyaltyTiers,
  walletLedger, pointsLedger, prepaidPacks, prepaidPackPurchases, referrals,
  vouchers, voucherIssuances,
} = schema;

/** Reload bonus policy: +10% bonus on top-ups of RM 50 and above. */
export const RELOAD_BONUS_THRESHOLD_SEN = 5_000;
export const RELOAD_BONUS_PCT = 10;

export async function topUpWallet(memberId: string, amountSen: number) {
  if (amountSen <= 0) throw new Error("Top-up amount must be positive");
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    await tx.insert(walletLedger).values({
      memberId, deltaSen: amountSen, reason: "reload",
      note: `Wallet top-up RM ${(amountSen / 100).toFixed(2)}`,
    });
    let bonusSen = 0;
    if (amountSen >= RELOAD_BONUS_THRESHOLD_SEN) {
      bonusSen = Math.round((amountSen * RELOAD_BONUS_PCT) / 100);
      await tx.insert(walletLedger).values({
        memberId, deltaSen: bonusSen, reason: "bonus",
        note: `${RELOAD_BONUS_PCT}% reload bonus`,
      });
    }
    return { amountSen, bonusSen };
  });
}

export async function purchasePack(memberId: string, packId: string) {
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    const [pack] = await tx.select().from(prepaidPacks).where(eq(prepaidPacks.id, packId));
    if (!pack) throw new Error("Pack not found");
    // paid from wallet if balance covers it, else recorded as external payment
    const [balRow] = await tx.select({ bal: sql<number>`coalesce(sum(${walletLedger.deltaSen}),0)` })
      .from(walletLedger).where(eq(walletLedger.memberId, memberId));
    const fromWallet = Number(balRow?.bal ?? 0) >= pack.priceSen;
    if (fromWallet) {
      await tx.insert(walletLedger).values({
        memberId, deltaSen: -pack.priceSen, reason: "spend",
        note: `Prepaid pack: ${pack.name}`,
      });
    }
    const [purchase] = await tx.insert(prepaidPackPurchases).values({
      packId, memberId, remaining: pack.quantity,
    }).returning();
    return { purchase, pack, paidFromWallet: fromWallet };
  });
}

export async function redeemPackItem(purchaseId: string) {
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    const [purchase] = await tx.select().from(prepaidPackPurchases)
      .where(eq(prepaidPackPurchases.id, purchaseId));
    if (!purchase || purchase.remaining <= 0) throw new Error("Nothing left to redeem");
    await tx.update(prepaidPackPurchases)
      .set({ remaining: purchase.remaining - 1 })
      .where(eq(prepaidPackPurchases.id, purchaseId));
    return { remaining: purchase.remaining - 1 };
  });
}

export type CampaignSegment = "all" | "gold" | "silver" | "bronze" | "lapsed_30";

/**
 * Bulk voucher campaign — issues one voucher instance per member in the
 * chosen segment. Skips members already holding an unexpired issuance of
 * the same voucher (same idempotency rule as the win-back sweep).
 */
export async function runVoucherCampaign(orgId: string, voucherId: string, segment: CampaignSegment, actorId?: string) {
  const db = await getDb();
  const [voucher] = await db.select().from(vouchers).where(eq(vouchers.id, voucherId));
  if (!voucher) throw new Error("Voucher not found");

  let members = await db.select({ m: loyaltyMembers, tier: loyaltyTiers.name })
    .from(loyaltyMembers)
    .leftJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id))
    .where(eq(loyaltyMembers.orgId, orgId));

  if (segment === "gold") members = members.filter((r) => r.tier === "Gold");
  else if (segment === "silver") members = members.filter((r) => r.tier === "Silver");
  else if (segment === "bronze") members = members.filter((r) => r.tier === "Bronze");
  else if (segment === "lapsed_30") {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    members = members.filter((r) => r.m.lastVisitAt && new Date(r.m.lastVisitAt).getTime() < cutoff);
  }

  let issued = 0, skipped = 0;
  for (const { m } of members) {
    const existing = await db.select().from(voucherIssuances)
      .where(and(
        eq(voucherIssuances.memberId, m.id),
        eq(voucherIssuances.voucherId, voucherId),
        eq(voucherIssuances.status, "issued"),
        gt(voucherIssuances.expiresAt, new Date()),
      ));
    if (existing.length > 0) { skipped++; continue; }
    await db.insert(voucherIssuances).values({
      voucherId, memberId: m.id, sourceNote: `Campaign: ${segment}`,
      expiresAt: new Date(Date.now() + voucher.validDays * 24 * 3600 * 1000),
    });
    issued++;
  }
  await writeAudit(db, {
    orgId, actorId, action: "voucher.campaign", entityType: "voucher", entityId: voucherId,
    detail: { segment, issued, skipped, segmentSize: members.length },
  });
  return { issued, skipped, segmentSize: members.length };
}

export const REFERRER_REWARD_PTS = 500;
export const REFEREE_REWARD_PTS = 250;

/** Enroll a new loyalty member; referral code grants both sides points. */
export async function enrollMember(input: {
  orgId: string; name: string; phone: string; email?: string; referralCode?: string;
}) {
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    const [program] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.orgId, input.orgId));
    if (!program) throw new Error("No loyalty program configured");
    const tiers = await tx.select().from(loyaltyTiers)
      .where(eq(loyaltyTiers.programId, program.id)).orderBy(loyaltyTiers.position);

    const [contact] = await tx.insert(contacts).values({
      orgId: input.orgId, name: input.name, phone: input.phone, email: input.email?.toLowerCase() || null,
    }).returning();

    const [member] = await tx.insert(loyaltyMembers).values({
      orgId: input.orgId, programId: program.id, contactId: contact.id,
      tierId: tiers[0].id,
      qrToken: `LYA-${Date.now().toString(16).toUpperCase().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`,
    }).returning();

    // own referral code for sharing
    const ownCode = `${input.name.split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "MEMBER"}-${member.id.slice(0, 4).toUpperCase()}`;
    await tx.insert(referrals).values({
      orgId: input.orgId, referrerMemberId: member.id, code: ownCode,
    });

    let referralApplied: { referrerName: string } | null = null;
    if (input.referralCode?.trim()) {
      const [ref] = await tx.select().from(referrals)
        .where(eq(referrals.code, input.referralCode.trim().toUpperCase()));
      if (ref && ref.referrerMemberId !== member.id) {
        await tx.insert(pointsLedger).values([
          { memberId: ref.referrerMemberId, delta: REFERRER_REWARD_PTS, reason: "referral" as const, note: `Referral reward · ${input.name} joined` },
          { memberId: member.id, delta: REFEREE_REWARD_PTS, reason: "referral" as const, note: `Welcome bonus · referred by code ${ref.code}` },
        ]);
        if (!ref.refereeMemberId) {
          await tx.update(referrals)
            .set({ refereeMemberId: member.id, rewardStatus: "granted" })
            .where(eq(referrals.id, ref.id));
        }
        const [refMember] = await tx.select({ name: contacts.name })
          .from(loyaltyMembers).innerJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
          .where(eq(loyaltyMembers.id, ref.referrerMemberId));
        referralApplied = { referrerName: refMember?.name ?? "member" };
      }
    }

    return { member, contact, ownCode, referralApplied };
  });
}

/** Data for the member-detail referral card */
export async function memberReferralInfo(db: any, memberId: string) {
  const [own] = await db.select().from(referrals)
    .where(and(eq(referrals.referrerMemberId, memberId), isNull(referrals.refereeMemberId)));
  const granted = await db.select({ r: referrals, name: contacts.name })
    .from(referrals)
    .leftJoin(loyaltyMembers, eq(referrals.refereeMemberId, loyaltyMembers.id))
    .leftJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .where(and(eq(referrals.referrerMemberId, memberId), eq(referrals.rewardStatus, "granted")));
  return { code: own?.code ?? granted[0]?.r.code ?? null, referred: granted.filter((g: any) => g.name) };
}
