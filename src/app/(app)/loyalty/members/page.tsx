import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { rm, timeAgo } from "@/lib/format";
import { TierAvatar, TierChip } from "@/components/tier-avatar";

export const dynamic = "force-dynamic";
const { loyaltyMembers, loyaltyTiers, contacts, pointsLedger } = schema;

export default async function MembersPage() {
  await requireRole(["admin", "marketing", "store_ops"]);
  const db = await getDb();

  const rows = await db.select({
    member: loyaltyMembers,
    contact: contacts,
    tier: loyaltyTiers.name,
    points: sql<number>`(select coalesce(sum(${pointsLedger.delta}),0) from ${pointsLedger} where ${pointsLedger.memberId} = ${loyaltyMembers.id})`,
  })
    .from(loyaltyMembers)
    .innerJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .leftJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id))
    .orderBy(desc(loyaltyMembers.ltvSen));

  const lapsedCutoff = Date.now() - 30 * 24 * 3600 * 1000;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h1 className="font-display font-bold text-2xl">Members</h1>
          <div className="text-[13px] text-ink-faint mt-0.5">{rows.length} loyalty members · Kopi Lima Rewards</div>
        </div>
        <a href="/api/export/members" className="btn-ghost">⬇ Export CSV</a>
      </div>

      <div className="card">
        <div className="card-title">All members · sorted by lifetime value</div>
        <div>
          <div className="grid grid-cols-[auto_1.6fr_1fr_100px_90px_90px_110px] gap-3 items-center px-4 py-2 border-b border-line-soft text-[10px] font-bold uppercase tracking-wide text-ink-faint max-lg:hidden">
            <span className="w-[30px]" /><span>Member</span><span>Contact</span>
            <span className="text-right">LTV</span><span className="text-right">Visits</span>
            <span className="text-right">Points</span><span className="text-right">Last visit</span>
          </div>
          {rows.map((r) => {
            const lapsed = r.member.lastVisitAt && new Date(r.member.lastVisitAt).getTime() < lapsedCutoff;
            return (
              <Link key={r.member.id} href={`/loyalty/members/${r.member.id}`}
                className="grid grid-cols-[auto_1.6fr_1fr_100px_90px_90px_110px] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px] hover:bg-canvas transition-colors max-lg:grid-cols-[auto_1fr_auto]">
                <TierAvatar name={r.contact.name} tier={r.tier} />
                <div>
                  <b className="font-semibold">{r.contact.name}</b>{" "}
                  <TierChip tier={r.tier} />
                  {lapsed && <span className="ml-1 text-[10px] font-bold text-warn bg-warn-soft px-1.5 py-0.5 rounded-full uppercase">lapsed</span>}
                </div>
                <span className="text-ink-faint text-[12px] truncate max-lg:hidden">{r.contact.phone}</span>
                <span className="font-data font-semibold text-right max-lg:hidden">{rm(r.member.ltvSen)}</span>
                <span className="font-data text-right text-ink-soft max-lg:hidden">{r.member.totalVisits}</span>
                <span className="font-data text-right text-ink-soft max-lg:hidden">{Number(r.points).toLocaleString()}</span>
                <span className="font-data text-[11px] text-ink-faint text-right">{timeAgo(r.member.lastVisitAt)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
