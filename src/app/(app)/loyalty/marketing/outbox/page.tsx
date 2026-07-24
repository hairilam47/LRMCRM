import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { dt } from "@/lib/format";
import { OutboxActions } from "./outbox-actions";

export const dynamic = "force-dynamic";
const { messageOutbox, loyaltyMembers, contacts } = schema;

export default async function OutboxPage() {
  await requireRole(["admin", "marketing"]);
  const db = await getDb();

  const [counts, rows] = await Promise.all([
    db.select({ ch: messageOutbox.channel, n: sql<number>`count(*)` }).from(messageOutbox).groupBy(messageOutbox.channel),
    db.select({ msg: messageOutbox, memberName: contacts.name })
      .from(messageOutbox)
      .leftJoin(loyaltyMembers, eq(messageOutbox.memberId, loyaltyMembers.id))
      .leftJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
      .orderBy(desc(messageOutbox.createdAt))
      .limit(40),
  ]);



  const chStyle: Record<string, string> = {
    sms: "bg-[#EAF1FE] text-primary",
    push: "bg-success-soft text-success",
    email: "bg-warn-soft text-warn",
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Message outbox</h1>
          <div className="text-[13px] text-ink-faint mt-0.5">
            {counts.map((c) => `${c.n} ${c.ch}`).join(" · ")} — queued by automation rules.
          </div>
        </div>
        <OutboxActions />
      </div>

      <div className="card">
        <div className="card-title">Queued &amp; sent messages</div>
        <div>
          {rows.map(({ msg, memberName }) => (
            <div key={msg.id} className="grid grid-cols-[70px_1fr_150px_130px] gap-3 items-start px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px] max-lg:grid-cols-[auto_1fr]">
              <span className={`font-data font-bold text-[10px] uppercase px-2 py-0.5 rounded-full w-fit mt-0.5 ${chStyle[msg.channel] ?? "bg-surface-muted text-ink-faint"}`}>{msg.channel}</span>
              <div>
                <b className="font-semibold block text-[12px]">{msg.ruleName ?? "Manual"}{memberName ? ` → ${memberName}` : ""}</b>
                <span className="text-[12px] text-ink-soft">{msg.body}</span>
              </div>
              <span className={`font-data text-[11px] max-lg:hidden ${msg.status === "failed" ? "text-danger font-semibold" : "text-ink-faint"}`}>{msg.status}{msg.scheduledFor ? ` · sched ${dt(msg.scheduledFor)}` : ""}</span>
              <span className="font-data text-[11px] text-ink-faint text-right max-lg:hidden">{dt(msg.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
