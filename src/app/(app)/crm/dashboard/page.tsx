import Link from "next/link";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { rm, rmShort } from "@/lib/format";

export const dynamic = "force-dynamic";
const { deals, pipelineStages, accounts, leads, users } = schema;

export default async function CrmDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireRole(["admin", "sales"]);
  const { denied } = await searchParams;
  const db = await getDb();
  const staleCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [openPipeline, staleDeals, pipeline, leadStats, leaderboard] = await Promise.all([
    // Open = not in a won stage
    db.select({
      total: sql<number>`coalesce(sum(${deals.amountSen}),0)`,
      n: sql<number>`count(*)`,
    })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(eq(pipelineStages.isWon, 0)),

    db.select({
      deal: deals, accountName: accounts.name, stageName: pipelineStages.name,
    })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .leftJoin(accounts, eq(deals.accountId, accounts.id))
      .where(and(eq(pipelineStages.isWon, 0), lt(deals.stageEnteredAt, staleCutoff)))
      .orderBy(deals.stageEnteredAt)
      .limit(8),

    db.select({
      stage: pipelineStages.name, position: pipelineStages.position, isWon: pipelineStages.isWon,
      total: sql<number>`coalesce(sum(${deals.amountSen}),0)`, n: sql<number>`count(${deals.id})`,
    })
      .from(pipelineStages)
      .leftJoin(deals, eq(deals.stageId, pipelineStages.id))
      .groupBy(pipelineStages.name, pipelineStages.position, pipelineStages.isWon)
      .orderBy(pipelineStages.position),

    db.select({ status: leads.status, n: sql<number>`count(*)` }).from(leads).groupBy(leads.status),

    db.select({
      ownerId: deals.ownerId, ownerName: users.name,
      wonCount: sql<number>`sum(case when ${pipelineStages.isWon} = 1 then 1 else 0 end)`,
      wonValueSen: sql<number>`coalesce(sum(case when ${pipelineStages.isWon} = 1 then ${deals.amountSen} else 0 end),0)`,
      openCount: sql<number>`sum(case when ${pipelineStages.isWon} = 0 then 1 else 0 end)`,
      openValueSen: sql<number>`coalesce(sum(case when ${pipelineStages.isWon} = 0 then ${deals.amountSen} else 0 end),0)`,
    })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .innerJoin(users, eq(deals.ownerId, users.id))
      .groupBy(deals.ownerId, users.name)
      .orderBy(desc(sql`3`)),
  ]);

  const [{ total: openPipelineSen, n: openDealCount }] = openPipeline;
  const mql = Number(leadStats.find((l) => l.status === "mql")?.n ?? 0);
  const sqlN = Number(leadStats.find((l) => l.status === "sql")?.n ?? 0);
  const conv = mql + sqlN > 0 ? Math.round((sqlN / (mql + sqlN)) * 100) : 0;
  const maxStage = Math.max(...pipeline.map((s) => Number(s.total)), 1);
  const funnelOrder = ["new", "mql", "sql", "converted", "lost"] as const;
  const funnelLabel: Record<string, string> = { new: "New", mql: "MQL", sql: "SQL", converted: "Converted", lost: "Lost" };

  return (
    <div>
      {denied && (
        <div className="mb-5 text-[13px] font-semibold text-danger bg-danger-soft rounded-xl px-4 py-3">
          Your role ({user.role}) doesn&apos;t have access to that page. Contact an admin if you believe this is wrong.
        </div>
      )}
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-5">
        <div>
          <h1 className="font-display font-bold text-2xl">CRM — good day, {user.name}</h1>
          <div className="text-[13px] text-ink-faint mt-0.5">Corporate Catering pipeline · Kopi Lima Group</div>
        </div>
        <Link href="/crm/deals" className="btn-primary">+ New deal</Link>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-4 max-lg:grid-cols-1">
        <Kpi label="Open pipeline" value={rmShort(Number(openPipelineSen))} sub={`${openDealCount} open deals`} />
        <Kpi
          label="Stale deals"
          value={String(staleDeals.length)}
          sub={staleDeals.length > 0 ? "> 7 days in stage — needs attention" : "everything is moving"}
          good={staleDeals.length === 0}
        />
        <Kpi label="Lead → SQL conversion" value={`${conv}%`} sub={`target > 25% · ${sqlN} SQL / ${mql} MQL`} good={conv >= 25} />
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4 max-lg:grid-cols-1">
        <div className="card">
          <div className="card-title">
            Stale deals <Link href="/crm/deals" className="text-primary normal-case tracking-normal">Open board →</Link>
          </div>
          <div>
            {staleDeals.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-ink-faint">No stale deals — every open deal moved stage within the last 7 days.</div>
            )}
            {staleDeals.map(({ deal, accountName, stageName }) => {
              const days = Math.floor((Date.now() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000);
              return (
                <div key={deal.id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px]">
                  <div>
                    <b className="font-semibold block">{deal.name}</b>
                    <span className="text-[11px] text-ink-faint">{accountName ?? "—"} · stuck in {stageName}</span>
                  </div>
                  <span className="font-data font-semibold">{rmShort(deal.amountSen)}</span>
                  <span className="font-data text-[11px] font-semibold text-warn bg-warn-soft px-2 py-0.5 rounded-full">{days}d</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Lead funnel</div>
          <div className="p-4 flex flex-col gap-3">
            {funnelOrder.map((status) => {
              const n = Number(leadStats.find((l) => l.status === status)?.n ?? 0);
              const max = Math.max(...funnelOrder.map((s) => Number(leadStats.find((l) => l.status === s)?.n ?? 0)), 1);
              return (
                <div key={status} className="grid grid-cols-[70px_1fr_30px] items-center gap-2.5 text-[12px] font-semibold text-ink-soft">
                  <span>{funnelLabel[status]}</span>
                  <div className="h-2 bg-surface-muted rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${(n / max) * 100}%`, background: status === "lost" ? "var(--color-danger)" : status === "converted" ? "var(--color-success)" : "linear-gradient(180deg,#4480FF,#115DFC,#0550ED)" }} />
                  </div>
                  <span className="font-data text-right">{n}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Rep leaderboard</div>
          <div>
            {leaderboard.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-ink-faint">No deals with an assigned owner yet.</div>
            )}
            {leaderboard.map((r) => (
              <div key={r.ownerId} className="grid grid-cols-[1fr_auto] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px]">
                <div>
                  <b className="font-semibold block">{r.ownerName}</b>
                  <span className="text-[11px] text-ink-faint">{Number(r.openCount)} open · {rmShort(Number(r.openValueSen))} pipeline</span>
                </div>
                <div className="text-right">
                  <div className="font-data font-semibold text-success">{rmShort(Number(r.wonValueSen))}</div>
                  <span className="text-[11px] text-ink-faint">{Number(r.wonCount)} won</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card col-span-full max-lg:col-span-1">
          <div className="card-title">Pipeline by stage</div>
          <div className="grid grid-cols-5 gap-px bg-line-soft rounded-b-xl overflow-hidden max-md:grid-cols-2">
            {pipeline.map((s) => (
              <div key={s.stage} className="bg-surface px-4 py-3.5">
                <div className="font-bold text-[11px] uppercase tracking-wide text-ink-faint">{s.stage}</div>
                <div className="font-display font-bold text-[18px] mt-1">{rmShort(Number(s.total))}</div>
                <div className="font-data text-[11px] text-ink-faint">{s.n} deal{Number(s.n) === 1 ? "" : "s"}</div>
                <div className="h-1.5 bg-surface-muted rounded mt-2 overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(Number(s.total) / maxStage) * 100}%`, background: s.isWon === 1 ? "var(--color-success)" : "linear-gradient(180deg,#4480FF,#115DFC,#0550ED)" }} />
                </div>
              </div>
            ))}
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
      <div className={`font-data text-[11px] mt-0.5 ${good === false ? "text-warn" : good === true ? "text-success" : "text-ink-faint"}`}>{sub}</div>
    </div>
  );
}
