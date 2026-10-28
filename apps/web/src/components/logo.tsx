import Link from "next/link";

export function Mark({ size = 26, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect width="28" height="28" rx="8" fill={dark ? "#ffffff" : "#0a1311"} />
      <path d="M7 11V7h4M17 7h4v4M21 17v4h-4M11 21H7v-4" fill="none" stroke="#9ef0d8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.5 14.2l2.4 2.4 4.6-5" fill="none" stroke={dark ? "#0a1311" : "#ffffff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", dark = false }: { href?: string; dark?: boolean }) {
  return (
    <Link href={href} className="press inline-flex items-center gap-2.5" aria-label="Trace home">
      <Mark dark={dark} />
      <span className={`text-[17px] font-semibold tracking-[-0.02em] ${dark ? "text-white" : "text-ink"}`}>Trace</span>
    </Link>
  );
}
