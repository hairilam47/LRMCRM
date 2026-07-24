import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

const { leads, users } = schema;

export async function GET() {
  await requireRole(["admin", "sales"]);
  const db = await getDb();
  const rows = await db.select({ lead: leads, ownerName: users.name })
    .from(leads).leftJoin(users, eq(leads.ownerId, users.id))
    .orderBy(desc(leads.createdAt));

  const csv = toCsv(
    ["Name", "Email", "Company", "Title", "Fit score", "Intent score", "Total", "Status", "Owner", "Source", "Created"],
    rows.map(({ lead, ownerName }) => [
      lead.name, lead.email ?? "", lead.company ?? "", lead.title ?? "",
      lead.fitScore, lead.intentScore, lead.fitScore + lead.intentScore,
      lead.status, ownerName ?? "", lead.source ?? "",
      new Date(lead.createdAt).toISOString().slice(0, 10),
    ])
  );
  return csvResponse(`loya-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
