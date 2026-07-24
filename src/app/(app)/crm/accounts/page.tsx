import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { rmShort, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";
const { accounts, deals, contacts } = schema;

export default async function AccountsPage() {
  await requireRole(["admin", "sales"]);
  const db = await getDb();

  const rows = await db.select({
    account: accounts,
    dealCount: sql<number>`(select count(*) from ${deals} where ${deals.accountId} = ${accounts.id})`,
    dealValue: sql<number>`(select coalesce(sum(${deals.amountSen}),0) from ${deals} where ${deals.accountId} = ${accounts.id})`,
    contactCount: sql<number>`(select count(*) from ${contacts} where ${contacts.accountId} = ${accounts.id})`,
  }).from(accounts).orderBy(desc(sql`4`), desc(accounts.createdAt));

  async function createAccount(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const db2 = await getDb();
    const [org] = await db2.select().from(schema.organizations).limit(1);
    await db2.insert(accounts).values({
      orgId: org.id, name,
      industry: String(formData.get("industry") ?? "").trim() || null,
      employeeBand: String(formData.get("band") ?? "").trim() || null,
    });
    revalidatePath("/crm/accounts");
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-bold text-2xl">Accounts</h1>
        <div className="text-[13px] text-ink-faint mt-0.5">{rows.length} B2B accounts</div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4 items-start max-lg:grid-cols-1">
        <div className="card">
          <div className="card-title">All accounts</div>
          <div>
            <div className="grid grid-cols-[1.5fr_1fr_90px_110px_90px] gap-3 items-center px-4 py-2 border-b border-line-soft text-[10px] font-bold uppercase tracking-wide text-ink-faint max-lg:hidden">
              <span>Account</span><span>Industry</span><span className="text-right">Deals</span><span className="text-right">Pipeline</span><span className="text-right">Created</span>
            </div>
            {rows.map(({ account, dealCount, dealValue, contactCount }) => (
              <div key={account.id} className="grid grid-cols-[1.5fr_1fr_90px_110px_90px] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px] max-lg:grid-cols-[1fr_auto]">
                <div>
                  <b className="font-semibold block">{account.name}</b>
                  <span className="text-[11px] text-ink-faint">{Number(contactCount)} contact{Number(contactCount) === 1 ? "" : "s"}{account.employeeBand ? ` · ${account.employeeBand} employees` : ""}</span>
                </div>
                <span className="text-[12px] text-ink-soft max-lg:hidden">{account.industry ?? "—"}</span>
                <span className="font-data text-right text-ink-soft max-lg:hidden">{Number(dealCount)}</span>
                <span className="font-data font-semibold text-right">{Number(dealValue) > 0 ? rmShort(Number(dealValue)) : "—"}</span>
                <span className="font-data text-[11px] text-ink-faint text-right max-lg:hidden">{timeAgo(account.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">New account</div>
          <form action={createAccount} className="p-4 flex flex-col gap-3.5">
            <div className="field"><label>Company name</label><input name="name" required placeholder="e.g. IOI Properties Group" /></div>
            <div className="field"><label>Industry</label><input name="industry" placeholder="e.g. Property / Corporate" /></div>
            <div className="field">
              <label>Employee band</label>
              <select name="band" defaultValue="">
                <option value="">—</option>
                <option>1-10</option><option>11-50</option><option>51-200</option><option>201-1000</option><option>1000+</option>
              </select>
            </div>
            <button className="btn-primary self-start" type="submit">Create account</button>
          </form>
        </div>
      </div>
    </div>
  );
}
