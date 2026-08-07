"use server";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { resolveBlastAudience, type BlastSegment } from "@/modules/blast/audience";
import { sendBlast } from "@/modules/blast/send";
import { draftBlastCopy } from "@/modules/blast/generate-content";

async function currentOrg(db: any) {
  const [org] = await db.select().from(schema.organizations).limit(1);
  return org;
}

/** Live audience-size preview as the marketer picks a segment — counts only, no recipient list. */
export async function previewAudienceAction(segment: BlastSegment) {
  await requireRole(["admin", "marketing"]);
  const db = await getDb();
  const org = await currentOrg(db);
  const { segmentSize, eligible, excludedNoConsent, excludedNoPhone } = await resolveBlastAudience(db, org.id, segment);
  return { segmentSize, eligibleCount: eligible.length, excludedNoConsent, excludedNoPhone };
}

export async function draftAction(brief: string, segment: BlastSegment) {
  await requireRole(["admin", "marketing"]);
  const db = await getDb();
  const org = await currentOrg(db);
  return draftBlastCopy({ brief, segment, orgName: org.name });
}

export async function sendBlastAction(input: { name: string; segment: BlastSegment; body: string; mediaUrl?: string }) {
  const user = await requireRole(["admin", "marketing"]);
  const db = await getDb();
  const org = await currentOrg(db);
  const result = await sendBlast({
    orgId: org.id, name: input.name, segment: input.segment, body: input.body,
    mediaUrl: input.mediaUrl?.trim() || null, actorId: user.id,
  });
  revalidatePath("/loyalty/marketing/blast");
  return result;
}
