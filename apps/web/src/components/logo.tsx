import { useId } from "react";
import Link from "next/link";

// The Trace mark: a T whose stem lands in a check. The hold (the bar) over the
// proof (the check), on a squircle tile. Geometry is on a 32-unit grid.
export const SQUIRCLE = "M32.0 16.0 L31.99 21.37 L31.95 23.09 L31.88 24.32 L31.78 25.32 L31.65 26.16 L31.5 26.9 L31.32 27.55 L31.11 28.13 L30.86 28.65 L30.59 29.12 L30.27 29.54 L29.93 29.93 L29.54 30.27 L29.12 30.59 L28.65 30.86 L28.13 31.11 L27.55 31.32 L26.9 31.5 L26.16 31.65 L25.32 31.78 L24.32 31.88 L23.09 31.95 L21.37 31.99 L16.0 32.0 L10.63 31.99 L8.91 31.95 L7.68 31.88 L6.68 31.78 L5.84 31.65 L5.1 31.5 L4.45 31.32 L3.87 31.11 L3.35 30.86 L2.88 30.59 L2.46 30.27 L2.07 29.93 L1.73 29.54 L1.41 29.12 L1.14 28.65 L0.89 28.13 L0.68 27.55 L0.5 26.9 L0.35 26.16 L0.22 25.32 L0.12 24.32 L0.05 23.09 L0.01 21.37 L0.0 16.0 L0.01 10.63 L0.05 8.91 L0.12 7.68 L0.22 6.68 L0.35 5.84 L0.5 5.1 L0.68 4.45 L0.89 3.87 L1.14 3.35 L1.41 2.88 L1.73 2.46 L2.07 2.07 L2.46 1.73 L2.88 1.41 L3.35 1.14 L3.87 0.89 L4.45 0.68 L5.1 0.5 L5.84 0.35 L6.68 0.22 L7.68 0.12 L8.91 0.05 L10.63 0.01 L16.0 0.0 L21.37 0.01 L23.09 0.05 L24.32 0.12 L25.32 0.22 L26.16 0.35 L26.9 0.5 L27.55 0.68 L28.13 0.89 L28.65 1.14 L29.12 1.41 L29.54 1.73 L29.93 2.07 L30.27 2.46 L30.59 2.88 L30.86 3.35 L31.11 3.87 L31.32 4.45 L31.5 5.1 L31.65 5.84 L31.78 6.68 L31.88 7.68 L31.95 8.91 L31.99 10.63Z";
export const GLYPH_BAR = "M8.6 9h14.8M16 9v5.4";
export const GLYPH_CHECK = "M10.6 18.3l4.3 4.5 6.9-7.6";

type Tone = "violet" | "cream" | "ink";
const TONES: Record<Tone, { a: string; b: string; fg: string; edge: boolean }> = {
  violet: { a: "#7a52f4", b: "#4b22c4", fg: "#ffffff", edge: true },
  cream: { a: "#f5f0e6", b: "#e7dfcf", fg: "#4b22c4", edge: false },
  ink: { a: "#1a1325", b: "#1a1325", fg: "#ffffff", edge: false },
};

export function Mark({ size = 28, tone = "violet", className = "" }: { size?: number; tone?: Tone; className?: string }) {
  const id = useId().replace(/:/g, "");
  const t = TONES[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={`tg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.a} />
          <stop offset="1" stopColor={t.b} />
        </linearGradient>
        <linearGradient id={`te${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={SQUIRCLE} fill={`url(#tg${id})`} />
      {t.edge && <path d={SQUIRCLE} fill="none" stroke={`url(#te${id})`} strokeWidth=".8" transform="translate(.4 .4) scale(.975)" />}
      <path d={GLYPH_BAR} fill="none" stroke={t.fg} strokeWidth="3" strokeLinecap="round" />
      <path d={GLYPH_CHECK} fill="none" stroke={t.fg} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return <span className={`font-semibold tracking-[-0.05em] ${dark ? "text-white" : "text-ink"} ${className}`}>trace</span>;
}

export function Logo({ href = "/", dark = false, size = 28 }: { href?: string; dark?: boolean; size?: number }) {
  return (
    <Link href={href} className="press inline-flex items-center gap-2.5" aria-label="Trace home">
      <Mark size={size} />
      <Wordmark dark={dark} className="text-[21px] leading-none" />
    </Link>
  );
}
