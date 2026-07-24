import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { rm, dt } from "@/lib/format";
import { TierAvatar } from "@/components/tier-avatar";

export const dynamic = "force-dynamic";
const { posTransactions, stores, loyaltyMembers, loyaltyTiers, contacts } = schema;

export default async function TransactionsPage() {
  await requireRole(["admin", "store_ops"]);
  const db = await getDb();
  const rows = await db.select({
    tx: posTransactions, storeName: stores.name,
    memberName: contacts.name, tierName: loyaltyTiers.name, memberId: loyaltyMembers.id,
  })
    .from(posTransactions)
    .innerJoin(stores, eq(posTransactions.storeId, stores.id))
    .leftJoin(loyaltyMembers, eq(posTransactions.memberId, loyaltyMembers.id))
    .leftJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .leftJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id))
    .orderBy(desc(posTransactions.occurredAt))
    .limit(50);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Transactions</h1>
          <div className="text-[13px] text-ink-faint mt-0.5">Latest 50 POS transactions across all stores</div>
        </div>
        <a href="/api/export/transactions" className="btn-ghost">⬇ Export CSV</a>
      </div>
      <div className="card">
        <div className="card-title">POS feed</div>
        <div>
          {rows.map((r) => (
            <div key={r.tx.id} className="grid grid-cols-[auto_1.4fr_1fr_120px_110px_130px] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px] max-lg:grid-cols-[auto_1fr_auto]">
              <TierAvatar name={r.memberName ?? "G"} tier={r.tierName} />
              <div>
                <b className="font-semibold block">{r.memberName ?? "Guest"}</b>
                <span className="font-data text-[11px] text-ink-faint">{r.tx.externalRef}</span>
              </div>
              <span className="text-[12px] text-ink-faint max-lg:hidden">{r.storeName}</span>
              <span className="font-data text-[11px] text-ink-faint max-lg:hidden">{r.tx.identifierUsed}</span>
              <span className="font-data font-semibold text-right">{rm(r.tx.grossSen)}</span>
              <span className="font-data text-[11px] text-ink-faint text-right max-lg:hidden">{dt(r.tx.occurredAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
