"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWaConsentAction } from "./actions";

export function ConsentToggle({ memberId, consent }: { memberId: string; consent: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    startTransition(async () => {
      await setWaConsentAction(memberId, !consent);
      router.refresh();
    });
  }

  return (
    <div className="card px-4 py-3.5">
      <div className="font-bold text-[10px] uppercase tracking-wide text-ink-faint">WhatsApp marketing</div>
      <div className="flex items-center justify-between mt-1.5">
        <span className={`font-data font-bold text-[13px] ${consent ? "text-success" : "text-ink-faint"}`}>
          {consent ? "Opted in" : "Not opted in"}
        </span>
        <button className="btn-ghost h-7 px-2.5 text-[11px]" disabled={pending} onClick={toggle}>
          {pending ? "Saving…" : consent ? "Opt out" : "Opt in"}
        </button>
      </div>
      {!consent && <div className="text-[11px] text-ink-faint mt-1">Excluded from WhatsApp blast campaigns until opted in.</div>}
    </div>
  );
}
