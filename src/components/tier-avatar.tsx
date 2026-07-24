export function TierAvatar({ name, tier, size = 30 }: { name: string; tier?: string | null; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const ring = tier ? `ring-${tier.toLowerCase()}` : "";
  return (
    <div className={`avatar ${ring}`} style={{ width: size, height: size, fontSize: size * 0.36 }} title={tier ?? undefined}>
      {initials}
    </div>
  );
}
export function TierChip({ tier }: { tier?: string | null }) {
  if (!tier) return null;
  const styles: Record<string, string> = {
    Gold: "bg-[#FBF3DC] text-[#8A6A0C]",
    Silver: "bg-[#EDF0F4] text-[#525C6B]",
    Bronze: "bg-[#F6EBDD] text-[#7A5326]",
  };
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide ${styles[tier] ?? ""}`}>
      ● {tier}
    </span>
  );
}
