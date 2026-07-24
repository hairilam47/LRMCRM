import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["admin"]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between px-8 py-5 border-b border-line-soft bg-surface">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-a to-brand-b flex items-center justify-center font-display font-extrabold text-[14px] text-[#161616]">L</div>
            <div>
              <b className="font-display text-[16px] block leading-none">Settings</b>
              <span className="text-[10px] text-ink-faint uppercase tracking-wide">Kopi Lima Group</span>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-faint">Signed in as {user.name} · admin</span>
          <Link href="/" className="btn-ghost">← Back to hub</Link>
        </div>
      </header>
      <div className="px-8 pt-5">
        <SettingsTabs />
      </div>
      <main className="px-8 py-6 pb-16">{children}</main>
    </div>
  );
}
