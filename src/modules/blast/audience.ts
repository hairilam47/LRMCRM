import { eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { BlastSegment } from "./segments";

export type { BlastSegment } from "./segments";
export { BLAST_SEGMENTS } from "./segments";

export type BlastRecipient = {
  memberId: string;
  name: string;
  phone: string;
  tier: string | null;
  points: number;
};

export type AudienceResolution = {
  segmentSize: number;
  eligible: BlastRecipient[];
  excludedNoConsent: number;
  excludedNoPhone: number;
};

const { loyaltyMembers, loyaltyTiers, contacts, pointsLedger } = schema;

/**
 * Resolves the WhatsApp-blastable audience for a segment. Mirrors the
 * tier/lapsed segment logic in src/modules/loyalty/wallet.ts's
 * runVoucherCampaign — same segments, same semantics — but additionally
 * requires explicit marketing consent (contacts.waConsent) and a phone
 * number. Consent is enforced here, not left to callers, so there's exactly
 * one place this can be gotten wrong.
 */
export async function resolveBlastAudience(db: any, orgId: string, segment: BlastSegment): Promise<AudienceResolution> {
  let rows = await db.select({
    memberId: loyaltyMembers.id,
    name: contacts.name,
    phone: contacts.phone,
    waConsent: contacts.waConsent,
    tier: loyaltyTiers.name,
    lastVisitAt: loyaltyMembers.lastVisitAt,
    points: sql<number>`coalesce((select sum(${pointsLedger.delta}) from ${pointsLedger} where ${pointsLedger.memberId} = ${loyaltyMembers.id}), 0)`,
  })
    .from(loyaltyMembers)
    .innerJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .leftJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id))
    .where(eq(loyaltyMembers.orgId, orgId));

  if (segment === "gold") rows = rows.filter((r: any) => r.tier === "Gold");
  else if (segment === "silver") rows = rows.filter((r: any) => r.tier === "Silver");
  else if (segment === "bronze") rows = rows.filter((r: any) => r.tier === "Bronze");
  else if (segment === "lapsed_30") {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    rows = rows.filter((r: any) => r.lastVisitAt && new Date(r.lastVisitAt).getTime() < cutoff);
  }

  const segmentSize = rows.length;
  const excludedNoConsent = rows.filter((r: any) => !r.waConsent).length;
  const excludedNoPhone = rows.filter((r: any) => r.waConsent && !r.phone).length;
  const eligible: BlastRecipient[] = rows
    .filter((r: any) => r.waConsent && r.phone)
    .map((r: any) => ({ memberId: r.memberId, name: r.name, phone: r.phone, tier: r.tier, points: Number(r.points ?? 0) }));

  return { segmentSize, eligible, excludedNoConsent, excludedNoPhone };
}
