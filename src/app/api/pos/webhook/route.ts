import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { posWebhookSchema, ingestPosTransaction } from "@/modules/pos/ingest";

/**
 * POST /api/pos/webhook — the exact surface a real POS (Toast, Square,
 * StoreHub, custom) would call. HMAC-signed with POS_WEBHOOK_SECRET.
 * Prototype accepts unsigned requests from the built-in simulator.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  const sig = req.headers.get("x-loya-signature");
  if (sig) {
    const expected = createHmac("sha256", process.env.POS_WEBHOOK_SECRET ?? "demo-secret")
      .update(raw).digest("hex");
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let json: unknown;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const parsed = posWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const started = Date.now();
    const result = await ingestPosTransaction(parsed.data);
    return NextResponse.json({ ...result, latencyMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
