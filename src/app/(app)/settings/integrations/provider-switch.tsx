"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProviderAction } from "./actions";

const OPTIONS = [
  { value: "mock", label: "Mock", desc: "Always succeeds silently. Default for demos." },
  { value: "console", label: "Console", desc: "Logs each send to the server console — useful for verifying payloads during dev." },
] as const;

export function ProviderSwitch({ current }: { current: string }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function choose(v: "mock" | "console") {
    setValue(v);
    startTransition(async () => {
      await setProviderAction(v);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {OPTIONS.map((o) => (
        <label key={o.value} className={`flex items-start gap-3 border rounded-xl px-3.5 py-3 cursor-pointer transition-colors ${value === o.value ? "border-primary bg-[#EAF1FE]" : "border-line hover:bg-canvas"}`}>
          <input
            type="radio"
            name="provider"
            checked={value === o.value}
            disabled={pending}
            onChange={() => choose(o.value)}
            className="mt-0.5 accent-primary"
          />
          <div>
            <b className="font-semibold text-[13px] block">{o.label}</b>
            <span className="text-[12px] text-ink-faint">{o.desc}</span>
          </div>
        </label>
      ))}
    </div>
  );
}
