"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BLAST_SEGMENTS, type BlastSegment } from "@/modules/blast/segments";
import { previewAudienceAction, draftAction, sendBlastAction } from "./actions";

type SendResult =
  | { ok: true; audienceSize: number; sent: number; failed: number; excludedNoConsent: number; excludedNoPhone: number }
  | { ok: false; error: string };

export function BlastComposer({ aiAvailable }: { aiAvailable: boolean }) {
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<BlastSegment>("all");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [brief, setBrief] = useState("");

  const [audience, setAudience] = useState<{ segmentSize: number; eligibleCount: number; excludedNoConsent: number; excludedNoPhone: number } | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const [previewPending, startPreview] = useTransition();
  const [draftPending, startDraft] = useTransition();
  const [sendPending, startSend] = useTransition();
  const router = useRouter();

  useEffect(() => {
    startPreview(async () => setAudience(await previewAudienceAction(segment)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment]);

  function generateDraft() {
    if (!brief.trim()) return;
    setDraftError(null);
    startDraft(async () => {
      const res = await draftAction(brief.trim(), segment);
      if (res.ok) setBody(res.draft);
      else setDraftError(res.error);
    });
  }

  function send() {
    if (!name.trim() || !body.trim()) return;
    setSendResult(null);
    startSend(async () => {
      const res = await sendBlastAction({ name: name.trim(), segment, body: body.trim(), mediaUrl: mediaUrl.trim() || undefined });
      setSendResult(res);
      if (res.ok) { setName(""); setBody(""); setMediaUrl(""); setBrief(""); }
      router.refresh();
    });
  }

  const eligible = audience?.eligibleCount ?? 0;
  const canSend = !!name.trim() && !!body.trim() && eligible > 0 && !sendPending;

  return (
    <div className="card">
      <div className="card-title">Compose blast</div>
      <div className="p-4 flex flex-col gap-3.5">
        <div className="field">
          <label>Campaign name (internal — recipients never see this)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold tier pastry launch — Aug 2026" />
        </div>

        <div className="field">
          <label>Segment</label>
          <select value={segment} onChange={(e) => setSegment(e.target.value as BlastSegment)}>
            {BLAST_SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="text-[11px] text-ink-faint mt-1">
            {previewPending || !audience
              ? "Checking audience…"
              : eligible === 0
                ? `0 recipients — ${audience.segmentSize} in this segment, but ${audience.excludedNoConsent} haven't opted in to WhatsApp and ${audience.excludedNoPhone} are missing a phone number.`
                : `${eligible} opted-in recipient${eligible === 1 ? "" : "s"} (of ${audience.segmentSize} in this segment${audience.excludedNoConsent > 0 ? ` — ${audience.excludedNoConsent} not opted in` : ""}${audience.excludedNoPhone > 0 ? `, ${audience.excludedNoPhone} missing phone` : ""}).`}
          </div>
        </div>

        {aiAvailable && (
          <div className="field">
            <label>AI draft brief (optional)</label>
            <div className="flex gap-2">
              <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. New pastry launch, friendly tone, mention weekend-only" />
              <button type="button" className="btn-ghost shrink-0" disabled={draftPending || !brief.trim()} onClick={generateDraft}>
                {draftPending ? "Drafting…" : "Generate draft"}
              </button>
            </div>
            {draftError && <div className="text-[11px] text-danger mt-1">{draftError}</div>}
          </div>
        )}

        <div className="field">
          <label>Message — merge fields: {"{{name}}"} {"{{first_name}}"} {"{{tier}}"} {"{{points}}"}</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Hi {{first_name}}, ..." />
        </div>

        <div className="field">
          <label>Media URL (optional — public image link)</label>
          <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." />
        </div>

        <button className="btn-primary self-start" disabled={!canSend} onClick={send}>
          {sendPending ? "Sending…" : `Send to ${eligible} recipient${eligible === 1 ? "" : "s"}`}
        </button>

        {sendResult && (
          sendResult.ok ? (
            <div className="text-[12px] font-semibold text-success bg-success-soft rounded-md px-3 py-2">
              Sent to {sendResult.sent} of {sendResult.audienceSize}{sendResult.failed > 0 ? ` (${sendResult.failed} failed)` : ""}.
            </div>
          ) : (
            <div className="text-[12px] font-semibold text-danger bg-danger-soft rounded-md px-3 py-2">{sendResult.error}</div>
          )
        )}
      </div>
    </div>
  );
}
