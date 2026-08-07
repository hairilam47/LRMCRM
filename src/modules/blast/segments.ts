/**
 * Pure, client-safe segment definitions — kept separate from audience.ts
 * (which imports the DB client) so client components can import the
 * segment list/type without pulling server-only code into the browser
 * bundle. Same segments as src/modules/loyalty/wallet.ts's CampaignSegment.
 */
export type BlastSegment = "all" | "gold" | "silver" | "bronze" | "lapsed_30";

export const BLAST_SEGMENTS: { value: BlastSegment; label: string }[] = [
  { value: "all", label: "All members" },
  { value: "gold", label: "Gold tier only" },
  { value: "silver", label: "Silver tier only" },
  { value: "bronze", label: "Bronze tier only" },
  { value: "lapsed_30", label: "Lapsed 30+ days" },
];
