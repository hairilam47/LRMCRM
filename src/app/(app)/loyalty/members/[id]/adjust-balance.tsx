"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustPointsAction, adjustWalletAction } from "./actions";

export function AdjustBalance({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"points" | "wallet">("points");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const val = Number(amount);
    if (!val || !reason.trim()) return;
    startTransition(async () => {
      if (kind === "points") await adjustPointsAction(memberId, Math.round(val), reason.trim());
      else await adjustWalletAction(memberId, val, reason.trim());
      setOpen(false); setAmount(""); setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return <button className="btn-ghost" onClick={() => setOpen(true)}>Adjust balance</button>;
  }

  return (
    <div className="card p-4 flex flex-col gap-3 w-[300px]">
      <div className="flex gap-1.5">
        <button type="button" className={`btn-ghost h-7 px-2.5 text-[11px] flex-1 ${kind === "points" ? "!bg-panel-dark !text-white !border-panel-dark" : ""}`} onClick={() => setKind("points")}>Points</button>
        <button type="button" className={`btn-ghost h-7 px-2.5 text-[11px] flex-1 ${kind === "wallet" ? "!bg-panel-dark !text-white !border-panel-dark" : ""}`} onClick={() => setKind("wallet")}>Wallet (RM)</button>
      </div>
      <div className="field">
        <label>{kind === "points" ? "Points delta (± allowed)" : "RM delta (± allowed)"}</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={kind === "points" ? "e.g. -50 or 200" : "e.g. -5.00 or 10.00"} />
      </div>
      <div className="field"><label>Reason (required, logged on ledger)</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goodwill gesture, complaint resolution" /></div>
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn-primary" disabled={pending || !amount || !reason.trim()} onClick={submit}>{pending ? "Saving…" : "Apply"}</button>
      </div>
    </div>
  );
}
