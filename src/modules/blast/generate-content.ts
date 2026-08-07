import Anthropic from "@anthropic-ai/sdk";

/**
 * AI-assisted drafting for blast copy. A "Generate draft" button in the
 * composer only — the draft is always shown back to the marketer for
 * review/edit before anything is sent; nothing here ever sends a message
 * itself. Quietly unavailable (not an error state) when ANTHROPIC_API_KEY
 * isn't configured, so the composer degrades to manual-only.
 */

export type DraftBlastInput = {
  brief: string; // e.g. "Gold-tier pastry launch promo, friendly tone"
  segment: string; // "all" | "gold" | "silver" | "bronze" | "lapsed_30"
  orgName: string;
};

export type DraftBlastOutcome = { ok: true; draft: string } | { ok: false; error: string };

const MODEL = "claude-opus-5";

export function aiDraftingAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function draftBlastCopy(input: DraftBlastInput): Promise<DraftBlastOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI drafting isn't configured (ANTHROPIC_API_KEY not set) — write the message manually below." };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      output_config: { effort: "medium" },
      system: `You write short WhatsApp marketing messages for ${input.orgName}, a loyalty program. Rules:
- Keep it under 300 characters — WhatsApp marketing messages should be scannable in one glance.
- Warm, direct tone. No corporate boilerplate, no excessive emoji (0-1 max).
- Weave in merge fields naturally where they fit: {{first_name}}, {{tier}}, {{points}}. Don't force all of them in.
- No markdown formatting (no *, _, #) — this is a plain WhatsApp text message.
- Output ONLY the message text. No preamble, no quotes, no explanation.`,
      messages: [
        { role: "user", content: `Audience: ${input.segment} tier segment.\nBrief: ${input.brief}` },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "Claude declined to draft this one — try rephrasing the brief, or write it manually." };
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock || !textBlock.text.trim()) {
      return { ok: false, error: "Claude returned an empty draft — try rephrasing the brief." };
    }
    return { ok: true, draft: textBlock.text.trim() };
  } catch (e) {
    return { ok: false, error: `Draft generation failed: ${(e as Error).message}` };
  }
}
