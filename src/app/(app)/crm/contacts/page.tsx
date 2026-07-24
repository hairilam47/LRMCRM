import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";
const { contacts, accounts } = schema;

export default async function ContactsPage() {
  await requireRole(["admin", "sales"]);
  const db = await getDb();

  const [rows, accountRows] = await Promise.all([
    db.select({ contact: contacts, accountName: accounts.name })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .orderBy(desc(contacts.createdAt)).limit(100),
    db.select().from(accounts).orderBy(accounts.name),
  ]);

  async function createContact(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const db2 = await getDb();
    const [org] = await db2.select().from(schema.organizations).limit(1);
    const accountId = String(formData.get("accountId") ?? "").trim();
    await db2.insert(contacts).values({
      orgId: org.id, name,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      title: String(formData.get("title") ?? "").trim() || null,
      accountId: accountId || null,
    });
    revalidatePath("/crm/contacts");
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-bold text-2xl">Contacts</h1>
        <div className="text-[13px] text-ink-faint mt-0.5">{rows.length} B2B contacts (loyalty members have their own profile under Loyalty → Members)</div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4 items-start max-lg:grid-cols-1">
        <div className="card">
          <div className="card-title">All contacts</div>
          <div>
            <div className="grid grid-cols-[1.3fr_1fr_1fr_90px] gap-3 items-center px-4 py-2 border-b border-line-soft text-[10px] font-bold uppercase tracking-wide text-ink-faint max-lg:hidden">
              <span>Name</span><span>Account</span><span>Contact info</span><span className="text-right">Added</span>
            </div>
            {rows.map(({ contact, accountName }) => (
              <div key={contact.id} className="grid grid-cols-[1.3fr_1fr_1fr_90px] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px] max-lg:grid-cols-[1fr_auto]">
                <div>
                  <b className="font-semibold block">{contact.name}</b>
                  {contact.title && <span className="text-[11px] text-ink-faint">{contact.title}</span>}
                </div>
                <span className="text-[12px] text-ink-soft max-lg:hidden">{accountName ?? "—"}</span>
                <span className="text-[12px] text-ink-faint truncate max-lg:hidden">{contact.email ?? contact.phone ?? "—"}</span>
                <span className="font-data text-[11px] text-ink-faint text-right max-lg:hidden">{timeAgo(contact.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">New contact</div>
          <form action={createContact} className="p-4 flex flex-col gap-3.5">
            <div className="field"><label>Full name</label><input name="name" required /></div>
            <div className="field"><label>Title</label><input name="title" placeholder="e.g. Procurement Lead" /></div>
            <div className="field"><label>Email</label><input name="email" type="email" /></div>
            <div className="field"><label>Phone</label><input name="phone" /></div>
            <div className="field">
              <label>Account</label>
              <select name="accountId" defaultValue="">
                <option value="">— No account —</option>
                {accountRows.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <button className="btn-primary self-start" type="submit">Create contact</button>
          </form>
        </div>
      </div>
    </div>
  );
}
