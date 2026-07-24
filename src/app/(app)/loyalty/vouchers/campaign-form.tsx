"use client";
import { useState, useTransition } from "react";
import { runCampaignAction } from "./actions";
import type { CampaignSegment } from "@/modules/loyalty/wallet";

const SEGMENTS: { value: CampaignSegment; label: string }[] = [
  { value: "all", label: "All members" },
  { value: "gold", label: "Gold tier only" },
  { value: "silver", label: "Silver tier only" },
  { value: "bronze", label: "Bronze tier only" },
  { value: "lapsed_30", label: "Lapsed 30+ days" },
];

export function CampaignForm({ vouchers }: { vouchers: { id: string; name: string }[] }) {
  const [voucherId, setVoucherId] = useState(vouchers[0]?.id ?? "");
  const [segment, setSegment] = useState<CampaignSegment>("all");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ issued: number; skipped: number; segmentSize: number } | null>(null);

  function run() {
    if (!voucherId) return;
    setResult(null);
    startTransition(async () => {
      const res = await runCampaignAction(voucherId, segment);
      setResult(res);
    });
  }

  return (
    <div className="card">
      <div className="card-title">Bulk campaign</div>
      <div className="p-4 flex flex-col gap-3.5">
        <div className="field">
          <label>Voucher</label>
          <select value={voucherId} onChange={(e) => setVoucherId(e.target.value)}>
            {vouchers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Segment</label>
          <select value={segment} onChange={(e) => setSegment(e.target.value as CampaignSegment)}>
            {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <button className="btn-primary self-start" disabled={pending || !voucherId} onClick={run}>
          {pending ? "Issuing…" : "Run campaign"}
        </button>
        {result && (
          <div className="text-[12px] font-semibold text-success bg-success-soft rounded-md px-3 py-2">
            Issued to {result.issued} of {result.segmentSize} members{result.skipped > 0 ? ` (${result.skipped} already held an unexpired voucher)` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}
