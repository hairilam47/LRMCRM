"use server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pointsBalance } from "@/modules/loyalty/engine";

const { loyaltyMembers, loyaltyTiers, contacts } = schema;

export async function lookupMember(kind: string, value: string) {
  if (!value.trim()) return null;
  const db = await getDb();
  const rows = await db.select({ member: loyaltyMembers, contact: contacts, tier: loyaltyTiers.name })
    .from(loyaltyMembers)
    .innerJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .leftJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id));
  const norm = kind === "phone" ? value.replace(/[\s-]/g, "") : value.toLowerCase().trim();
  for (const r of rows) {
    const hit =
      (kind === "phone" && (r.contact.phone ?? "").replace(/[\s-]/g, "") === norm) ||
      (kind === "email" && (r.contact.email ?? "").toLowerCase() === norm) ||
      (kind === "qr" && r.member.qrToken === value.trim());
    if (hit) {
      const db2 = await getDb();
      return {
        name: r.contact.name, tier: r.tier ?? "Bronze",
        visits: r.member.totalVisits,
        points: await pointsBalance(db2, r.member.id),
      };
    }
  }
  return null;
}
