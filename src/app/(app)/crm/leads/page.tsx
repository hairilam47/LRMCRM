import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { captureLead, SQL_THRESHOLD } from "@/modules/crm/scoring";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";
const { leads, users } = schema;

const SIM_LEADS = [
  { name: "Melissa Chong", email: "melissa@parksongroup.my", company: "Parkson Retail Group Berhad", title: "VP Customer Experience", behaviors: ["pricing_page", "demo_request"] },
  { name: "Hafiz Rahman", email: "hafiz@kualakopi.my", company: "Kuala Kopi", title: "Owner", behaviors: ["whitepaper"] },
  { name: "Diana Teoh", email: "diana@sunwaymalls.com", company: "Sunway Malls Enterprise", title: "Director of Marketing", behaviors: ["demo_request"] },
  { name: "Kenji Wong", email: "kenji@ramenlab.my", company: "Ramen Lab F&B", title: "Operations Manager", behaviors: ["pricing_page", "whitepaper"] },
];

export default async function LeadsPage() {
  await requireRole(["admin", "sales"]);
  const db = await getDb();
  const rows = await db.select({ lead: leads, ownerName: users.name })
    .from(leads)
    .leftJoin(users, eq(leads.ownerId, users.id))
    .orderBy(desc(leads.createdAt));

  async function simulateLead() {
    "use server";
    const db2 = await getDb();
    const [org] = await db2.select().from(schema.organizations).limit(1);
    const existing = await db2.select({ email: leads.email }).from(leads);
    const emails = new Set(existing.map((e) => e.email));
    const candidate = SIM_LEADS.find((l) => !emails.has(l.email)) ?? SIM_LEADS[0];
    await captureLead({ orgId: org.id, source: "webform", ...candidate });
    revalidatePath("/crm/leads");
  }

  const statusStyle: Record<string, string> = {
    sql: "bg-success-soft text-success",
    mql: "bg-[#EAF1FE] text-primary",
    new: "bg-surface-muted text-ink-faint",
    converted: "bg-success-soft text-success",
    lost: "bg-danger-soft text-danger",
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Leads</h1>
          <div className="text-[13px] text-ink-faint mt-0.5">
            Fit (max 50) + Intent (max 50) · ≥ {SQL_THRESHOLD} routes as SQL with a 15-min SLA task
          </div>
        </div>
        <div className="flex gap-2">
          <a href="/api/export/leads" className="btn-ghost">⬇ Export CSV</a>
          <form action={simulateLead}>
            <button className="btn-primary" type="submit">+ Simulate inbound lead</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Inbound leads · scored &amp; routed by the engine</div>
        <div>
          <div className="grid grid-cols-[1.5fr_1fr_170px_90px_110px_90px] gap-3 items-center px-4 py-2 border-b border-line-soft text-[10px] font-bold uppercase tracking-wide text-ink-faint max-lg:hidden">
            <span>Lead</span><span>Company</span><span>Score</span><span>Status</span><span>Owner</span><span className="text-right">Created</span>
          </div>
          {rows.map(({ lead, ownerName }) => {
            const total = lead.fitScore + lead.intentScore;
            return (
              <div key={lead.id} className="grid grid-cols-[1.5fr_1fr_170px_90px_110px_90px] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px] max-lg:grid-cols-[1fr_auto]">
                <div>
                  <b className="font-semibold block">{lead.name}</b>
                  <span className="text-[11px] text-ink-faint">{lead.title} · {lead.email}</span>
                </div>
                <span className="text-[12px] text-ink-soft truncate max-lg:hidden">{lead.company}</span>
                <div className="flex items-center gap-2 max-lg:hidden">
                  <div className="flex-1 h-2 bg-surface-muted rounded overflow-hidden">
                    <div className="h-full" style={{ width: `${total}%`, background: total >= SQL_THRESHOLD ? "var(--color-success)" : "linear-gradient(180deg,#4480FF,#115DFC,#0550ED)" }} />
                  </div>
                  <span className="font-data text-[12px] font-semibold w-[52px]">{total}<span className="text-ink-ghost text-[10px]"> ({lead.fitScore}+{lead.intentScore})</span></span>
                </div>
                <span className={`font-bold text-[10px] uppercase px-2 py-0.5 rounded-full w-fit ${statusStyle[lead.status]}`}>{lead.status}</span>
                <span className="text-[12px] text-ink-soft max-lg:hidden">{ownerName ?? "—"}</span>
                <span className="font-data text-[11px] text-ink-faint text-right max-lg:hidden">{timeAgo(lead.createdAt)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
