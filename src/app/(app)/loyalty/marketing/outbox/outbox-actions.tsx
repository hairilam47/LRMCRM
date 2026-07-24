"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sweepAction, dispatchAction } from "./actions";

export function OutboxActions() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function dispatch() {
    setMsg(null);
    startTransition(async () => {
      const res = await dispatchAction();
      setMsg(`Dispatched via "${res.provider}": ${res.sent} sent${res.failed > 0 ? `, ${res.failed} failed` : ""}${res.remaining > 0 ? `, ${res.remaining} still due` : ""}. ${res.sent === 0 && res.failed === 0 ? "Nothing was due yet — scheduled messages wait for their send time." : ""}`);
      router.refresh();
    });
  }

  function sweep() {
    setMsg(null);
    startTransition(async () => {
      const res = await sweepAction();
      setMsg(`Win-back sweep: ${res.swept} member${res.swept === 1 ? "" : "s"} swept.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={pending} onClick={dispatch}>Dispatch queued (mock ESP)</button>
        <button className="btn-primary" disabled={pending} onClick={sweep}>Run 30-day win-back sweep</button>
      </div>
      {msg && <div className="text-[12px] font-semibold text-success bg-success-soft rounded-md px-3 py-1.5 max-w-[420px] text-right">{msg}</div>}
    </div>
  );
}
