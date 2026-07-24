import Link from "next/link";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { rm, rmShort, timeAgo } from "@/lib/format";
import { TierAvatar } from "@/components/tier-avatar";

export const dynamic = "force-dynamic";

const { posTransactions, stores, loyaltyMembers, loyaltyTiers, contacts, messageOutbox } = schema;

export default async function LoyaltyDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireRole(["admin", "marketing", "store_ops"]);
  const { denied } = await searchParams;
  const db = await getDb();
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [[rev], [aov], byStore, tierDist, feed, [queued], lifecycle] = await Promise.all([
    db.select({ total: sql<number>`coalesce(sum(${posTransactions.netSen}),0)` })
      .from(posTransactions)
      .where(and(gte(posTransactions.occurredAt, since30), isNotNull(posTransactions.memberId))),
    db.select({ v: sql<number>`coalesce(avg(${posTransactions.netSen}),0)` })
      .from(posTransactions).where(gte(posTransactions.occurredAt, since30)),
    db.select({ name: stores.name, total: sql<number>`coalesce(sum(${posTransactions.netSen}),0)` })
      .from(posTransactions)
      .innerJoin(stores, eq(posTransactions.storeId, stores.id))
      .where(gte(posTransactions.occurredAt, since30))
      .groupBy(stores.name).orderBy(desc(sql`2`)),
    db.select({ tier: loyaltyTiers.name, n: sql<number>`count(*)` })
      .from(loyaltyMembers)
      .innerJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id))
      .groupBy(loyaltyTiers.name, loyaltyTiers.position)
      .orderBy(desc(loyaltyTiers.position)),
    db.select({
      tx: posTransactions, storeName: stores.name,
      memberName: contacts.name, tierName: loyaltyTiers.name,
      pts: sql<number>`(select coalesce(sum(${schema.pointsLedger.delta}),0) from ${schema.pointsLedger} where ${schema.pointsLedger.posTransactionId} = ${posTransactions.id} and ${schema.pointsLedger.reason} = 'earn')`,
    })
      .from(posTransactions)
      .innerJoin(stores, eq(posTransactions.storeId, stores.id))
      .leftJoin(loyaltyMembers, eq(posTransactions.memberId, loyaltyMembers.id))
      .leftJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
      .leftJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id))
      .orderBy(desc(posTransactions.occurredAt)).limit(6),
    db.select({ n: sql<number>`count(*)` }).from(messageOutbox).where(eq(messageOutbox.status, "queued")),

    db.select({
      active: sql<number>`sum(case when ${loyaltyMembers.lastVisitAt} >= now() - interval '30 days' then 1 else 0 end)`,
      atRisk: sql<number>`sum(case when ${loyaltyMembers.lastVisitAt} < now() - interval '30 days' and ${loyaltyMembers.lastVisitAt} >= now() - interval '60 days' then 1 else 0 end)`,
      lapsed: sql<number>`sum(case when ${loyaltyMembers.lastVisitAt} < now() - interval '60 days' or ${loyaltyMembers.lastVisitAt} is null then 1 else 0 end)`,
      lapsedValueSen: sql<number>`coalesce(sum(case when ${loyaltyMembers.lastVisitAt} < now() - interval '60 days' or ${loyaltyMembers.lastVisitAt} is null then ${loyaltyMembers.ltvSen} else 0 end),0)`,
    }).from(loyaltyMembers),
  ]);
  const [lifecycleRow] = lifecycle;

  const maxStore = Math.max(...byStore.map((s) => Number(s.total)), 1);
  const maxTier = Math.max(...tierDist.map((t) => Number(t.n)), 1);
  const tierColor: Record<string, string> = { Gold: "var(--color-tier-gold)", Silver: "var(--color-tier-silver)", Bronze: "var(--color-tier-bronze)" };
  const totalMembers = tierDist.reduce((s, t) => s + Number(t.n), 0);

  return (
    <div>
      {denied && (
        <div className="mb-5 text-[13px] font-semibold text-danger bg-danger-soft rounded-xl px-4 py-3">
          Your role ({user.role}) doesn&apos;t have access to that page. Contact an admin if you believe this is wrong.
        </div>
      )}
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-5">
        <div>
          <h1 className="font-display font-bold text-2xl">Loyalty — good day, {user.name}</h1>
          <div className="text-[13px] text-ink-faint mt-0.5">
            {new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" })} · Kopi Lima Group · {totalMembers} members
          </div>
        </div>
        {(user.role === "admin" || user.role === "store_ops") && (
          <Link href="/loyalty/pos/simulator" className="btn-primary">⚡ Open POS simulator</Link>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-4 max-lg:grid-cols-2">
        <Kpi label="Loyalty revenue · 30d" value={rmShort(Number(rev.total))} sub="member-linked net sales" />
        <Kpi label="Avg order value" value={rm(Math.round(Number(aov.v)))} sub="all transactions · 30d" />
        <Kpi label="Active members" value={String(totalMembers)} sub="across all tiers" />
        <Kpi label="Queued messages" value={String(Number(queued?.n ?? 0))} sub="awaiting dispatch in Outbox" />
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4 max-lg:grid-cols-1">
        <div className="card">
          <div className="card-title">
            Live POS activity <Link href="/loyalty/pos/transactions" className="text-primary normal-case tracking-normal">All transactions →</Link>
          </div>
          <div>
            {feed.map((r) => (
              <div key={r.tx.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px]">
                <TierAvatar name={r.memberName ?? "Guest"} tier={r.tierName} />
                <div>
                  <b className="font-semibold block">{r.memberName ?? `Guest · ${r.tx.externalRef}`}</b>
                  <span className="text-[11px] text-ink-faint">{r.storeName} · {timeAgo(r.tx.occurredAt)}</span>
                </div>
                <span className="font-data font-semibold">{rm(r.tx.grossSen)}</span>
                {r.memberName ? (
                  <span className="font-data text-[11px] font-semibold text-success bg-success-soft px-2 py-0.5 rounded-full">+{r.pts} pts</span>
                ) : (
                  <span className="font-data text-[11px] font-semibold text-ink-faint bg-surface-muted px-2 py-0.5 rounded-full">unmatched</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="card-title">Revenue by store · 30d</div>
            <div className="p-4 flex flex-col gap-3.5">
              {byStore.map((s) => (
                <div key={s.name} className="grid grid-cols-[110px_1fr_80px] items-center gap-3 text-[13px] font-semibold text-ink-soft">
                  <span className="truncate">{s.name.replace("Kopi Lima · ", "")}</span>
                  <div className="h-2.5 bg-surface-muted rounded-[5px] overflow-hidden">
                    <div className="h-full rounded-[5px]" style={{ width: `${(Number(s.total) / maxStore) * 100}%`, background: "linear-gradient(180deg,#4480FF,#115DFC,#0550ED)" }} />
                  </div>
                  <span className="font-data text-[12px] text-ink text-right">{rmShort(Number(s.total))}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Member tiers</div>
            <div className="p-4 flex flex-col gap-3">
              {tierDist.map((t) => (
                <div key={t.tier} className="grid grid-cols-[64px_1fr_44px] items-center gap-2.5 text-[12px] font-semibold text-ink-soft">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: tierColor[t.tier] }} />{t.tier}
                  </span>
                  <div className="h-2 bg-surface-muted rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${(Number(t.n) / maxTier) * 100}%`, background: tierColor[t.tier] }} />
                  </div>
                  <span className="font-data text-[12px] text-ink text-right">{t.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card col-span-full max-lg:col-span-1">
          <div className="card-title">Member lifecycle</div>
          <div className="grid grid-cols-3 gap-px bg-line-soft rounded-b-xl overflow-hidden max-md:grid-cols-1">
            <div className="bg-surface px-4 py-3.5">
              <div className="font-bold text-[11px] uppercase tracking-wide text-ink-faint">Active</div>
              <div className="font-display font-bold text-[22px] mt-1 text-success">{Number(lifecycleRow?.active ?? 0)}</div>
              <div className="font-data text-[11px] text-ink-faint">visited within 30 days</div>
            </div>
            <div className="bg-surface px-4 py-3.5">
              <div className="font-bold text-[11px] uppercase tracking-wide text-ink-faint">At risk</div>
              <div className="font-display font-bold text-[22px] mt-1 text-warn">{Number(lifecycleRow?.atRisk ?? 0)}</div>
              <div className="font-data text-[11px] text-ink-faint">30–60 days since last visit</div>
            </div>
            <div className="bg-surface px-4 py-3.5">
              <div className="font-bold text-[11px] uppercase tracking-wide text-ink-faint">Lapsed</div>
              <div className="font-display font-bold text-[22px] mt-1 text-danger">{Number(lifecycleRow?.lapsed ?? 0)}</div>
              <div className="font-data text-[11px] text-ink-faint">{rmShort(Number(lifecycleRow?.lapsedValueSen ?? 0))} lifetime value at risk</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div className="card p-4 relative overflow-hidden group">
      <div className="absolute inset-x-0 top-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(120deg,#1CB0FF,#40FF99)" }} />
      <div className="font-bold text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="font-display font-extrabold text-[26px] mt-1">{value}</div>
      <div className={`font-data text-[11px] mt-0.5 ${good === false ? "text-warn" : "text-ink-faint"}`}>{sub}</div>
    </div>
  );
}
