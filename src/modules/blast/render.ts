import type { BlastRecipient } from "./audience";

export type MergeContext = { name: string; first_name: string; tier: string; points: number };

/**
 * Substitutes {{field}} merge tokens (canonical Handlebars-style, same
 * syntax OpenWA's own template system uses — see OpenWA's
 * src/common/utils/template-render.ts). Unlike src/modules/automation/
 * engine.ts's render() (single-brace, first-occurrence-only, hardcoded to
 * 5 POS-context keys), this is generic and replaces every occurrence.
 * Unknown/unmatched tokens are left literal, not blanked — a visibly wrong
 * template beats a silently empty one.
 */
export function renderMergeFields(template: string, ctx: MergeContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = (ctx as Record<string, unknown>)[key];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

export function mergeContextFor(r: BlastRecipient): MergeContext {
  return {
    name: r.name,
    first_name: r.name.split(" ")[0] || r.name,
    tier: r.tier ?? "Member",
    points: r.points,
  };
}
