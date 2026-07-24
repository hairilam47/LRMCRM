import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { rm } from "@/lib/format";
import { CampaignForm } from "./campaign-form";
import { editVoucherFormAction } from "./actions";

export const dynamic = "force-dynamic";
const { vouchers, voucherIssuances, contacts, loyaltyMembers } = schema;

export default async function VouchersPage() {
  await requireRole(["admin", "marketing"]);
  const db = await getDb();

  const rows = await db.select({
    v: vouchers,
    issued: sql<number>`(select count(*) from ${voucherIssuances} where ${voucherIssuances.voucherId} = ${vouchers.id})`,
    redeemed: sql<number>`(select count(*) from ${voucherIssuances} where ${voucherIssuances.voucherId} = ${vouchers.id} and ${voucherIssuances.status} = 'redeemed')`,
  }).from(vouchers).orderBy(desc(vouchers.id));

  async function createVoucher(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const db2 = await getDb();
    const [org] = await db2.select().from(schema.organizations).limit(1);
    await db2.insert(vouchers).values({
      orgId: org.id, name,
      kind: String(formData.get("kind") ?? "fixed"),
      valueSen: Number(formData.get("value") ?? 0) * (String(formData.get("kind")) === "percent" ? 1 : 100),
      minSpendSen: Number(formData.get("minSpend") ?? 0) * 100,
      validDays: Number(formData.get("validDays") ?? 7),
    });
    revalidatePath("/loyalty/vouchers");
  }

  async function issueVoucher(formData: FormData) {
    "use server";
    const phone = String(formData.get("phone") ?? "").replace(/[\s-]/g, "");
    const voucherId = String(formData.get("voucherId") ?? "");
    if (!phone || !voucherId) return;
    const db2 = await getDb();
    const rows2 = await db2.select({ member: loyaltyMembers, contact: contacts })
      .from(loyaltyMembers).innerJoin(contacts, eq(loyaltyMembers.contactId, contacts.id));
    const hit = rows2.find((r) => (r.contact.phone ?? "").replace(/[\s-]/g, "") === phone);
    if (!hit) return;
    const [voucher] = await db2.select().from(vouchers).where(eq(vouchers.id, voucherId));
    await db2.insert(voucherIssuances).values({
      voucherId, memberId: hit.member.id, sourceNote: "Manual issue",
      expiresAt: new Date(Date.now() + voucher.validDays * 24 * 3600 * 1000),
    });
    revalidatePath("/loyalty/vouchers");
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-bold text-2xl">Vouchers</h1>
        <div className="text-[13px] text-ink-faint mt-0.5">Templates used by automations, stamp rewards, and manual issuance</div>
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-4 items-start max-lg:grid-cols-1">
        <div className="card">
          <div className="card-title">All vouchers</div>
          <div>
            <div className="grid grid-cols-[1.4fr_90px_100px_90px_90px_70px] gap-3 items-center px-4 py-2 border-b border-line-soft text-[10px] font-bold uppercase tracking-wide text-ink-faint max-lg:hidden">
              <span>Name</span><span>Kind</span><span>Min spend</span><span className="text-right">Issued</span><span className="text-right">Redeemed</span><span></span>
            </div>
            {rows.map(({ v, issued, redeemed }) => (
              <details key={v.id} className="group border-b border-line-soft last:border-0">
                <summary className="grid grid-cols-[1.4fr_90px_100px_90px_90px_70px] gap-3 items-center px-4 py-2.5 text-[13px] cursor-pointer list-none max-lg:grid-cols-[1fr_auto]">
                  <div>
                    <b className="font-semibold block">{v.name}</b>
                    <span className="text-[11px] text-ink-faint">{v.validDays}-day validity</span>
                  </div>
                  <span className="text-[12px] text-ink-soft capitalize max-lg:hidden">{v.kind}{v.kind === "fixed" ? ` · ${rm(v.valueSen)}` : v.kind === "percent" ? ` · ${v.valueSen}%` : ""}</span>
                  <span className="font-data text-[12px] text-ink-faint max-lg:hidden">{v.minSpendSen > 0 ? rm(v.minSpendSen) : "—"}</span>
                  <span className="font-data text-right max-lg:hidden">{Number(issued)}</span>
                  <span className="font-data text-right text-success max-lg:hidden">{Number(redeemed)}</span>
                  <span className="text-[11px] font-semibold text-primary text-right">Edit</span>
                </summary>
                <form action={editVoucherFormAction} className="px-4 pb-4 grid grid-cols-4 gap-2.5 items-end">
                  <input type="hidden" name="voucherId" value={v.id} />
                  <input type="hidden" name="kind" value={v.kind} />
                  <div className="field"><label>Value{v.kind === "percent" ? " (%)" : v.kind === "fixed" ? " (RM)" : ""}</label>
                    <input name="value" type="number" defaultValue={v.kind === "fixed" ? v.valueSen / 100 : v.valueSen} disabled={v.kind === "free_item"} />
                  </div>
                  <div className="field"><label>Min spend (RM)</label><input name="minSpend" type="number" defaultValue={v.minSpendSen / 100} /></div>
                  <div className="field"><label>Valid days</label><input name="validDays" type="number" defaultValue={v.validDays} /></div>
                  <button className="btn-primary h-[38px]" type="submit">Save</button>
                </form>
              </details>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="card-title">New voucher template</div>
            <form action={createVoucher} className="p-4 flex flex-col gap-3.5">
              <div className="field"><label>Name</label><input name="name" required placeholder="e.g. RM 10 Birthday Gift" /></div>
              <div className="field">
                <label>Kind</label>
                <select name="kind" defaultValue="fixed">
                  <option value="fixed">Fixed (RM)</option>
                  <option value="percent">Percent (%)</option>
                  <option value="free_item">Free item</option>
                </select>
              </div>
              <div className="field"><label>Value</label><input name="value" type="number" defaultValue={0} /></div>
              <div className="field"><label>Min spend (RM)</label><input name="minSpend" type="number" defaultValue={0} /></div>
              <div className="field"><label>Valid for (days)</label><input name="validDays" type="number" defaultValue={7} /></div>
              <button className="btn-primary self-start" type="submit">Create voucher</button>
            </form>
          </div>

          <div className="card">
            <div className="card-title">Issue to member</div>
            <form action={issueVoucher} className="p-4 flex flex-col gap-3.5">
              <div className="field"><label>Member phone</label><input name="phone" required placeholder="+6012 3000000" /></div>
              <div className="field">
                <label>Voucher</label>
                <select name="voucherId" required defaultValue="">
                  <option value="" disabled>Select a voucher…</option>
                  {rows.map(({ v }) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <button className="btn-ghost self-start" type="submit">Issue voucher</button>
            </form>
          </div>

          <CampaignForm vouchers={rows.map(({ v }) => ({ id: v.id, name: v.name }))} />
        </div>
      </div>
    </div>
  );
}
