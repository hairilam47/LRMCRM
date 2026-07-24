import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { listAuditLog } from "@/modules/audit/log";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const actionLabel: Record<string, string> = {
  "points.adjust": "Points adjustment",
  "wallet.adjust": "Wallet adjustment",
  "voucher.campaign": "Bulk voucher campaign",
  "voucher.edit": "Voucher template edited",
  "user.role_change": "Role changed",
  "user.routable_change": "Routable flag changed",
  "user.create": "User created",
  "settings.esp_provider": "ESP provider changed",
};
const actionColor: Record<string, string> = {
  "points.adjust": "bg-[#EAF1FE] text-primary",
  "wallet.adjust": "bg-[#EAF1FE] text-primary",
  "voucher.campaign": "bg-success-soft text-success",
  "voucher.edit": "bg-success-soft text-success",
  "user.role_change": "bg-warn-soft text-warn",
  "user.routable_change": "bg-warn-soft text-warn",
  "user.create": "bg-warn-soft text-warn",
  "settings.esp_provider": "bg-warn-soft text-warn",
};

function describeDetail(action: string, detail: Record<string, any>): string {
  switch (action) {
    case "points.adjust": return `${detail.delta > 0 ? "+" : ""}${detail.delta} pts — "${detail.reason}"`;
    case "wallet.adjust": return `${detail.deltaSen > 0 ? "+" : ""}RM ${(detail.deltaSen / 100).toFixed(2)} — "${detail.reason}"`;
    case "voucher.campaign": return `segment "${detail.segment}" — issued ${detail.issued}/${detail.segmentSize}, skipped ${detail.skipped}`;
    case "voucher.edit": return `"${detail.voucherName}" — RM${((detail.before?.valueSen ?? 0) / 100).toFixed(2)} → RM${((detail.after?.valueSen ?? 0) / 100).toFixed(2)}, ${detail.after?.validDays}d valid`;
    case "user.role_change": return `${detail.userName}: ${detail.fromRole} → ${detail.toRole}`;
    case "user.routable_change": return `${detail.userName}: routable = ${detail.routable}`;
    case "user.create": return `${detail.userName} (${detail.email}) as ${detail.role}`;
    case "settings.esp_provider": return `switched to "${detail.provider}"`;
    default: return JSON.stringify(detail);
  }
}

export default async function AuditLogPage() {
  await requireRole(["admin"]);
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  const rows = await listAuditLog(db, org.id, 200);

  return (
    <div>
      <h1 className="font-display font-bold text-2xl mb-1">Audit log</h1>
      <p className="text-[13px] text-ink-faint mb-5">Every manual adjustment, campaign, voucher edit, and user-management action — most recent first.</p>

      <div className="card">
        <div className="card-title">Activity ({rows.length})</div>
        <div>
          {rows.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-ink-faint">No audited actions yet.</div>}
          {rows.map(({ log, actorName }: any) => (
            <div key={log.id} className="grid grid-cols-[150px_1fr_130px] gap-3 items-start px-4 py-3 border-b border-line-soft last:border-0 text-[13px] max-lg:grid-cols-[1fr_auto]">
              <span className={`font-bold text-[10px] uppercase px-2 py-0.5 rounded-full w-fit ${actionColor[log.action] ?? "bg-surface-muted text-ink-faint"}`}>
                {actionLabel[log.action] ?? log.action}
              </span>
              <div>
                <span className="text-ink-soft">{describeDetail(log.action, log.detail ?? {})}</span>
                <span className="text-[11px] text-ink-faint block mt-0.5">by {actorName ?? "system"}</span>
              </div>
              <span className="font-data text-[11px] text-ink-faint text-right max-lg:hidden">{dt(log.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
