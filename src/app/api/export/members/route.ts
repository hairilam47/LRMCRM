import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

const { loyaltyMembers, loyaltyTiers, contacts, pointsLedger } = schema;

export async function GET() {
  await requireRole(["admin", "marketing", "store_ops"]);
  const db = await getDb();
  const rows = await db.select({
    name: contacts.name, phone: contacts.phone, email: contacts.email,
    tier: loyaltyTiers.name, ltvSen: loyaltyMembers.ltvSen, visits: loyaltyMembers.totalVisits,
    aovSen: loyaltyMembers.aovSen, lastVisitAt: loyaltyMembers.lastVisitAt, joinedAt: loyaltyMembers.joinedAt,
    points: sql<number>`(select coalesce(sum(${pointsLedger.delta}),0) from ${pointsLedger} where ${pointsLedger.memberId} = ${loyaltyMembers.id})`,
  })
    .from(loyaltyMembers)
    .innerJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .leftJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id))
    .orderBy(desc(loyaltyMembers.ltvSen));

  const csv = toCsv(
    ["Name", "Phone", "Email", "Tier", "LTV (RM)", "Visits", "AOV (RM)", "Points balance", "Last visit", "Joined"],
    rows.map((r) => [
      r.name, r.phone ?? "", r.email ?? "", r.tier ?? "Bronze",
      (r.ltvSen / 100).toFixed(2), r.visits, (r.aovSen / 100).toFixed(2), Number(r.points),
      r.lastVisitAt ? new Date(r.lastVisitAt).toISOString().slice(0, 10) : "",
      new Date(r.joinedAt).toISOString().slice(0, 10),
    ])
  );
  return csvResponse(`loya-members-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
