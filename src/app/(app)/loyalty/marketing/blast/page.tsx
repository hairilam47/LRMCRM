import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { dt } from "@/lib/format";
import { aiDraftingAvailable } from "@/modules/blast/generate-content";
import { BlastComposer } from "./blast-composer";

export const dynamic = "force-dynamic";
const { blastCampaigns } = schema;

const statusStyle: Record<string, string> = {
  draft: "bg-surface-muted text-ink-faint",
  sending: "bg-warn-soft text-warn",
  completed: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
};

export default async function BlastPage() {
  await requireRole(["admin", "marketing"]);
  const db = await getDb();

  const campaigns = await db.select().from(blastCampaigns).orderBy(desc(blastCampaigns.createdAt)).limit(20);

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-bold text-2xl">WhatsApp blast</h1>
        <div className="text-[13px] text-ink-faint mt-0.5">
          Send a message, media, or AI-drafted promo to opted-in loyalty members via WhatsApp (OpenWA).
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1.2fr] gap-4 items-start max-lg:grid-cols-1">
        <BlastComposer aiAvailable={aiDraftingAvailable()} />

        <div className="card">
          <div className="card-title">Recent campaigns</div>
          <div>
            {campaigns.length === 0 && (
              <div className="text-[12px] text-ink-faint px-4 py-3">No blast campaigns sent yet.</div>
            )}
            {campaigns.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_90px_100px] gap-3 items-start px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px] max-lg:grid-cols-[1fr_auto]">
                <div>
                  <b className="font-semibold block text-[12px]">{c.name}</b>
                  <span className="text-[12px] text-ink-soft">{c.body}</span>
                  <div className="text-[11px] text-ink-faint mt-0.5">{c.segment} · {dt(c.createdAt)}</div>
                </div>
                <span className={`font-data font-bold text-[10px] uppercase px-2 py-0.5 rounded-full w-fit mt-0.5 ${statusStyle[c.status] ?? "bg-surface-muted text-ink-faint"}`}>{c.status}</span>
                <span className="font-data text-[11px] text-ink-faint text-right max-lg:hidden">
                  {c.sentCount}/{c.audienceSize} sent{c.failedCount > 0 ? ` · ${c.failedCount} failed` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
