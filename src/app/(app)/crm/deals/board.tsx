"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleGateAction, moveDealAction, addNoteAction } from "./actions";

type Stage = { id: string; name: string; position: number; isWon: boolean; gateRequirements: { key: string; label: string; required: boolean }[] };
type Deal = {
  id: string; name: string; accountName: string; amountSen: number; stageId: string;
  stageEnteredAt: string; gateState: Record<string, boolean>;
  activity: { title: string; createdAt: string }[];
};

const rmShort = (sen: number) => {
  const v = sen / 100;
  return v >= 1000 ? `RM ${(v / 1000).toFixed(1)}k` : `RM ${v.toFixed(0)}`;
};
const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function DealBoard({ stages, deals: initialDeals }: { stages: Stage[]; deals: Deal[] }) {
  const [deals, setDeals] = useState(initialDeals);
  const [expandedGates, setExpandedGates] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [blockedMsg, setBlockedMsg] = useState<{ dealId: string; missing: string[] } | null>(null);
  const router = useRouter();

  function toggleGate(dealId: string, key: string, current: boolean) {
    setDeals((ds) => ds.map((d) => d.id === dealId ? { ...d, gateState: { ...d.gateState, [key]: !current } } : d));
    startTransition(() => { toggleGateAction(dealId, key, !current); });
  }

  function move(dealId: string, direction: "forward" | "back") {
    setBlockedMsg(null);
    startTransition(async () => {
      const res = await moveDealAction(dealId, direction);
      if (res.moved) {
        const targetStage = stages.find((s) => s.name === res.stage);
        if (targetStage) {
          setDeals((ds) => ds.map((d) => d.id === dealId
            ? { ...d, stageId: targetStage.id, stageEnteredAt: new Date().toISOString() }
            : d));
        }
      } else if (res.blocked.length > 0) {
        setBlockedMsg({ dealId, missing: res.blocked });
      }
    });
  }

  function addNote(dealId: string) {
    if (!noteDraft.trim()) return;
    const text = noteDraft.trim();
    setNoteDraft("");
    startTransition(async () => {
      await addNoteAction(dealId, text);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3.5 overflow-x-auto pb-4" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(240px, 1fr))` }}>
      {stages.map((stage) => {
        const stageDeals = deals.filter((d) => d.stageId === stage.id);
        const total = stageDeals.reduce((s, d) => s + d.amountSen, 0);
        return (
          <div key={stage.id} className="flex flex-col gap-2.5 min-w-[240px]">
            <div className="px-1">
              <div className="flex items-center justify-between">
                <b className="font-bold text-[11px] uppercase tracking-wide text-ink-faint">{stage.name}</b>
                <span className="font-data text-[11px] text-ink-faint">{stageDeals.length}</span>
              </div>
              <div className="font-data text-[12px] font-semibold text-ink mt-0.5">{rmShort(total)}</div>
            </div>

            <div className="flex flex-col gap-2.5">
              {stageDeals.map((deal) => {
                const stale = !stage.isWon && Date.now() - new Date(deal.stageEnteredAt).getTime() > 7 * 24 * 3600 * 1000;
                const gatesOpen = expandedGates === deal.id;
                const historyOpen = expandedHistory === deal.id;
                const stageIdx = stages.findIndex((s) => s.id === stage.id);
                return (
                  <div key={deal.id} className={`card p-3.5 ${stale ? "ring-1 ring-warn" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <b className="font-semibold text-[13px] block leading-snug">{deal.name}</b>
                        <span className="text-[11px] text-ink-faint">{deal.accountName}</span>
                      </div>
                      {stale && <span className="font-bold text-[9px] uppercase text-warn bg-warn-soft px-1.5 py-0.5 rounded-full shrink-0">stale</span>}
                    </div>
                    <div className="font-data font-bold text-[15px] mt-2">{rmShort(deal.amountSen)}</div>

                    <div className="flex gap-3 mt-2">
                      {stage.gateRequirements.length > 0 && (
                        <button type="button" onClick={() => setExpandedGates(gatesOpen ? null : deal.id)} className="text-[11px] font-semibold text-primary">
                          {gatesOpen ? "Hide gates ▲" : `Gates (${stage.gateRequirements.filter((g) => deal.gateState[g.key]).length}/${stage.gateRequirements.length}) ▾`}
                        </button>
                      )}
                      <button type="button" onClick={() => setExpandedHistory(historyOpen ? null : deal.id)} className="text-[11px] font-semibold text-ink-faint">
                        {historyOpen ? "Hide history ▲" : `History (${deal.activity.length}) ▾`}
                      </button>
                    </div>

                    {gatesOpen && (
                      <div className="mt-2 flex flex-col gap-1.5 border-t border-line-soft pt-2">
                        {stage.gateRequirements.map((g) => (
                          <label key={g.key} className="flex items-center gap-2 text-[12px] text-ink-soft cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!deal.gateState[g.key]}
                              onChange={() => toggleGate(deal.id, g.key, !!deal.gateState[g.key])}
                              className="accent-primary"
                            />
                            {g.label}{g.required && <span className="text-danger">*</span>}
                          </label>
                        ))}
                      </div>
                    )}

                    {historyOpen && (
                      <div className="mt-2 flex flex-col gap-2 border-t border-line-soft pt-2">
                        <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                          {deal.activity.length === 0 && <span className="text-[11px] text-ink-ghost">No activity yet.</span>}
                          {deal.activity.map((a, i) => (
                            <div key={i} className="text-[11px] text-ink-soft">
                              <span className="text-ink-faint font-data">{timeAgo(a.createdAt)}</span> — {a.title}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            className="flex-1 h-7 px-2 text-[11px] border border-line rounded-md outline-none focus:border-transparent focus:shadow-[0_0_0_2px_#242424]"
                            placeholder="Add a note…"
                            value={expandedHistory === deal.id ? noteDraft : ""}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addNote(deal.id); }}
                          />
                          <button className="btn-ghost h-7 px-2.5 text-[11px]" disabled={pending} onClick={() => addNote(deal.id)}>Add</button>
                        </div>
                      </div>
                    )}

                    {blockedMsg?.dealId === deal.id && (
                      <div className="mt-2 text-[11px] font-semibold text-danger bg-danger-soft rounded-md px-2 py-1.5">
                        Blocked — missing: {blockedMsg.missing.join(", ")}
                      </div>
                    )}

                    <div className="flex gap-1.5 mt-2.5">
                      {stageIdx > 0 && (
                        <button className="btn-ghost h-7 px-2.5 text-[11px]" disabled={pending} onClick={() => move(deal.id, "back")}>← Back</button>
                      )}
                      {stageIdx < stages.length - 1 && (
                        <button className="btn-primary h-7 px-2.5 text-[11px]" disabled={pending} onClick={() => move(deal.id, "forward")}>Advance →</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {stageDeals.length === 0 && (
                <div className="text-[11px] text-ink-ghost text-center py-6 border border-dashed border-line rounded-xl">No deals</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
