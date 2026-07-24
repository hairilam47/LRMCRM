import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser, logout } from "@/lib/auth";
import { rmShort } from "@/lib/format";

export const dynamic = "force-dynamic";
const { deals, pipelineStages, posTransactions, loyaltyMembers, messageOutbox } = schema;

export default async function HubPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;

  const canCrm = user.role === "admin" || user.role === "sales";
  const canLoyalty = user.role === "admin" || user.role === "marketing" || user.role === "store_ops";

  // Single-workspace roles skip the hub entirely — no real choice to present.
  if (canCrm && !canLoyalty) redirect(`/crm/dashboard${denied ? "?denied=1" : ""}`);
  if (canLoyalty && !canCrm) redirect(`/loyalty/dashboard${denied ? "?denied=1" : ""}`);
  if (!canCrm && !canLoyalty) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-canvas">
        <div className="card p-8 max-w-md text-center">
          <h1 className="font-display font-bold text-xl mb-2">No workspace access</h1>
          <p className="text-[13px] text-ink-faint">Your account ({user.role}) isn&apos;t assigned to CRM or Loyalty. Contact an admin.</p>
        </div>
      </div>
    );
  }

  // Admin (or any future multi-workspace role) — render the picker.
  const db = await getDb();
  const staleCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [[pipeline], [staleCount], [revenue], [members], [queued]] = await Promise.all([
    db.select({ total: sql<number>`coalesce(sum(${deals.amountSen}),0)`, n: sql<number>`count(*)` })
      .from(deals).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(eq(pipelineStages.isWon, 0)),
    db.select({ n: sql<number>`count(*)` })
      .from(deals).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(and(eq(pipelineStages.isWon, 0), lt(deals.stageEnteredAt, staleCutoff))),
    db.select({ total: sql<number>`coalesce(sum(${posTransactions.netSen}),0)` })
      .from(posTransactions)
      .where(and(gte(posTransactions.occurredAt, since30), isNotNull(posTransactions.memberId))),
    db.select({ n: sql<number>`count(*)` }).from(loyaltyMembers),
    db.select({ n: sql<number>`count(*)` }).from(messageOutbox).where(eq(messageOutbox.status, "queued")),
  ]);

  async function doLogout() {
    "use server";
    await logout();
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-line-soft">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-a to-brand-b flex items-center justify-center font-display font-extrabold text-[14px] text-[#161616]">L</div>
          <div>
            <b className="font-display text-[16px] block leading-none">LOYA</b>
            <span className="text-[10px] text-ink-faint uppercase tracking-wide">Kopi Lima Group</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-faint">Signed in as {user.name} · {user.role}</span>
          <Link href="/settings/users" className="btn-ghost">⚙ Settings</Link>
          <form action={doLogout}>
            <button type="submit" className="btn-ghost">Sign out</button>
          </form>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-8">
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl">Where are we working today?</h1>
          <p className="text-[14px] text-ink-faint mt-1.5">Pick a workspace — you can switch anytime from inside.</p>
        </div>

        {denied && (
          <div className="text-[13px] font-semibold text-danger bg-danger-soft rounded-xl px-4 py-3 max-w-md text-center">
            Your role ({user.role}) doesn&apos;t have access to that page.
          </div>
        )}

        <div className="grid grid-cols-2 gap-5 max-w-3xl w-full max-md:grid-cols-1">
          <Link href="/crm/dashboard" className="card p-7 hover:shadow-lg transition-shadow group relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(180deg,#4480FF,#115DFC,#0550ED)" }} />
            <div className="font-bold text-[11px] uppercase tracking-wide text-ink-faint mb-1">B2B</div>
            <h2 className="font-display font-bold text-2xl mb-1">CRM</h2>
            <p className="text-[13px] text-ink-faint mb-6">Leads, accounts, and the Corporate Catering pipeline.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-display font-extrabold text-xl">{rmShort(Number(pipeline.total))}</div>
                <div className="text-[11px] text-ink-faint">open pipeline · {pipeline.n} deals</div>
              </div>
              <div>
                <div className={`font-display font-extrabold text-xl ${Number(staleCount.n) > 0 ? "text-warn" : ""}`}>{staleCount.n}</div>
                <div className="text-[11px] text-ink-faint">stale deals</div>
              </div>
            </div>
            <div className="mt-6 text-[13px] font-semibold text-primary group-hover:underline">Enter CRM →</div>
          </Link>

          <Link href="/loyalty/dashboard" className="card p-7 hover:shadow-lg transition-shadow group relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(120deg,#1CB0FF,#40FF99)" }} />
            <div className="font-bold text-[11px] uppercase tracking-wide text-ink-faint mb-1">B2C</div>
            <h2 className="font-display font-bold text-2xl mb-1">Loyalty</h2>
            <p className="text-[13px] text-ink-faint mb-6">Members, POS, vouchers, and marketing automations.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-display font-extrabold text-xl">{rmShort(Number(revenue.total))}</div>
                <div className="text-[11px] text-ink-faint">revenue · 30d</div>
              </div>
              <div>
                <div className="font-display font-extrabold text-xl">{members.n}</div>
                <div className="text-[11px] text-ink-faint">active members</div>
              </div>
            </div>
            <div className="mt-6 text-[13px] font-semibold text-primary group-hover:underline">Enter Loyalty →</div>
          </Link>
        </div>

        {Number(queued.n) > 0 && (
          <div className="text-[12px] text-ink-faint">{queued.n} message{Number(queued.n) === 1 ? "" : "s"} queued in the Loyalty outbox</div>
        )}
      </main>
    </div>
  );
}
