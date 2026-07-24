import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

const { posTransactions, stores, loyaltyMembers, contacts } = schema;

export async function GET() {
  await requireRole(["admin", "store_ops"]);
  const db = await getDb();
  const rows = await db.select({
    tx: posTransactions, storeName: stores.name, memberName: contacts.name,
  })
    .from(posTransactions)
    .innerJoin(stores, eq(posTransactions.storeId, stores.id))
    .leftJoin(loyaltyMembers, eq(posTransactions.memberId, loyaltyMembers.id))
    .leftJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .orderBy(desc(posTransactions.occurredAt))
    .limit(1000);

  const csv = toCsv(
    ["External ref", "Store", "Member", "Identifier used", "Gross (RM)", "Net (RM)", "Tax (RM)", "Payment method", "Occurred at"],
    rows.map(({ tx, storeName, memberName }) => [
      tx.externalRef, storeName, memberName ?? "Guest", tx.identifierUsed,
      (tx.grossSen / 100).toFixed(2), (tx.netSen / 100).toFixed(2), (tx.taxSen / 100).toFixed(2),
      tx.paymentMethod, new Date(tx.occurredAt).toISOString(),
    ])
  );
  return csvResponse(`loya-transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
