import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { captureLead } from "@/modules/crm/scoring";

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  behaviors: z.array(z.string()).optional(),
});

/** POST /api/leads/capture — public web-form intake endpoint (spec §4 Phase 1). */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  if (!org) return NextResponse.json({ error: "no organization" }, { status: 500 });
  const result = await captureLead({ orgId: org.id, ...parsed.data });
  return NextResponse.json(result);
}
