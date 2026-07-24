type IconProps = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconDashboard({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="11" y="2.5" width="6.5" height="4.5" rx="1.4" />
      <rect x="11" y="9" width="6.5" height="8.5" rx="1.4" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4" />
    </svg>
  );
}
export function IconFunnel({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <path d="M3 3.5h14l-5.5 6.5v5.5l-3 1.5v-7L3 3.5Z" />
    </svg>
  );
}
export function IconBuilding({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <rect x="4" y="2.5" width="9" height="15" rx="1" />
      <path d="M7 6h1M11 6h1M7 9h1M11 9h1M7 12h1M11 12h1" />
      <path d="M13 8h2.5a1 1 0 0 1 1 1v8" />
    </svg>
  );
}
export function IconUser({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <circle cx="10" cy="6.5" r="3.2" />
      <path d="M3.5 17c1-3.4 4-5 6.5-5s5.5 1.6 6.5 5" />
    </svg>
  );
}
export function IconKanban({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <rect x="2.5" y="3" width="4.5" height="14" rx="1.2" />
      <rect x="8" y="3" width="4.5" height="9" rx="1.2" />
      <rect x="13.5" y="3" width="4" height="11" rx="1.2" />
    </svg>
  );
}
export function IconUsers({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <circle cx="7" cy="6.5" r="2.8" />
      <circle cx="14" cy="7.5" r="2.2" />
      <path d="M2.2 17c.8-3 3-4.6 4.8-4.6s4 1.6 4.8 4.6" />
      <path d="M12.8 12.9c1.6.1 3.3 1.4 3.9 4.1" />
    </svg>
  );
}
export function IconSliders({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <path d="M3 5h9M15 5h2M3 15h2M8 15h9" />
      <circle cx="14" cy="5" r="2" />
      <circle cx="6" cy="15" r="2" />
    </svg>
  );
}
export function IconTicket({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <path d="M2.5 8V6.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5V8a1.7 1.7 0 0 0 0 3.4V13a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 13v-1.6a1.7 1.7 0 0 0 0-3.4Z" />
      <path d="M8 5v1.3M8 8.3v2M8 13v1.5" strokeDasharray="0.1 2" />
    </svg>
  );
}
export function IconTerminal({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <rect x="2.5" y="4" width="15" height="12" rx="1.6" />
      <path d="M5.5 8l2.5 2.5-2.5 2.5M10.5 13h4" />
    </svg>
  );
}
export function IconReceipt({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <path d="M5 2.5h10v15l-2-1.3-1.5 1.3-1.5-1.3-1.5 1.3-1.5-1.3-2 1.3v-15Z" />
      <path d="M7.3 6.5h5.4M7.3 9.3h5.4M7.3 12h3.4" />
    </svg>
  );
}
export function IconSend({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" className={className} {...base}>
      <path d="M17 3 2.5 9.2 9 11l1.8 6.5L17 3Z" />
      <path d="M9 11l4.5-4.5" />
    </svg>
  );
}
export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" className={className} {...base}>
      <path d="M12.5 4 6.5 10l6 6" />
    </svg>
  );
}
export function IconLogout({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" className={className} {...base}>
      <path d="M8 3H4.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1H8" />
      <path d="M13 14l4-4-4-4M17 10H7.5" />
    </svg>
  );
}
