// The proof strip: a job drawn the way the Trace mark draws money. One
// segment per line, as wide as its price. A solid bar is money released for
// proved work; an outlined bar is money still held. Colour says where the
// line is in between.

import { money } from "@/lib/format";

export interface StripLine {
  code: string;
  title?: string;
  cents: number;
  status: string;
}

type Look = { fill: string; edge: string; dark: { fill: string; edge: string }; label: string; pattern?: "hatch" | "dash" };

const LOOK: Record<string, Look> = {
  CAPTURED: { fill: "bg-violet", edge: "border-violet", dark: { fill: "bg-lilac", edge: "border-lilac" }, label: "Paid" },
  APPROVED: { fill: "bg-violet/45", edge: "border-violet", dark: { fill: "bg-lilac/50", edge: "border-lilac" }, label: "Approved, ready to release" },
  VERIFIED: { fill: "bg-ok/15", edge: "border-ok", dark: { fill: "bg-[#5fd39a]/20", edge: "border-[#5fd39a]" }, label: "Verified" },
  NEEDS_REVIEW: { fill: "bg-warn/15", edge: "border-warn", dark: { fill: "bg-[#ffc56b]/20", edge: "border-[#ffc56b]" }, label: "Needs review" },
  FAILED: { fill: "bg-bad/10", edge: "border-bad", dark: { fill: "bg-[#ff8a7a]/15", edge: "border-[#ff8a7a]" }, label: "Failed", pattern: "hatch" },
  FLAGGED: { fill: "bg-warn/10", edge: "border-warn", dark: { fill: "bg-[#ffc56b]/15", edge: "border-[#ffc56b]" }, label: "Flagged", pattern: "hatch" },
  PROVING: { fill: "bg-transparent", edge: "border-violet", dark: { fill: "bg-transparent", edge: "border-lilac" }, label: "Being proved", pattern: "dash" },
  PENDING: { fill: "bg-transparent", edge: "border-line-2", dark: { fill: "bg-transparent", edge: "border-white/30" }, label: "Held, not started" },
  DROPPED: { fill: "bg-transparent", edge: "border-line", dark: { fill: "bg-transparent", edge: "border-white/10" }, label: "Dropped", pattern: "dash" },
};

const H = { xs: "h-2", sm: "h-3", md: "h-5", lg: "h-9" } as const;

export function ProofStrip({ lines, size = "sm", dark = false, labels = false, className = "" }: { lines: StripLine[]; size?: keyof typeof H; dark?: boolean; labels?: boolean; className?: string }) {
  if (!lines.length) {
    return <div className={`${H[size]} rounded-[4px] border border-dashed ${dark ? "border-white/20" : "border-line-2"} ${className}`} aria-label="No lines yet" />;
  }
  const radius = size === "lg" ? "rounded-[7px]" : size === "md" ? "rounded-[5px]" : "rounded-[3px]";
  return (
    <div className={`flex ${size === "xs" ? "gap-[2px]" : "gap-[3px]"} ${className}`} role="img" aria-label={lines.map((l) => `${l.code} ${LOOK[l.status]?.label ?? l.status}`).join(", ")}>
      {lines.map((l) => {
        const look = LOOK[l.status] ?? LOOK.PENDING!;
        const c = dark ? look.dark : look;
        return (
          <span
            key={l.code}
            title={`${l.code}${l.title ? ` · ${l.title}` : ""} · ${money(l.cents)} · ${look.label}`}
            className={`relative ${H[size]} ${radius} border-[1.5px] ${c.fill} ${c.edge} ${look.pattern === "dash" ? "border-dashed" : ""} overflow-hidden transition-colors duration-500`}
            style={{ flexGrow: Math.max(1, l.cents), flexBasis: 0, ...(look.pattern === "hatch" ? { backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1.5px, transparent 1.5px 6px)", color: dark ? "rgb(255 138 122 / 0.45)" : "rgb(180 35 24 / 0.35)" } : {}) }}
          >
            {labels && (
              <span className={`absolute inset-0 grid place-items-center font-mono text-[10.5px] font-semibold ${l.status === "CAPTURED" ? (dark ? "text-night" : "text-white") : dark ? "text-white/70" : "text-ink-2"}`}>{l.code}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function StripLegend({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  const items: [string, string][] = [
    ["CAPTURED", "Paid"],
    ["APPROVED", "Approved"],
    ["VERIFIED", "Verified"],
    ["NEEDS_REVIEW", "Review"],
    ["FAILED", "Failed"],
    ["PENDING", "Held"],
  ];
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] ${dark ? "text-white/60" : "text-muted"} ${className}`}>
      {items.map(([s, label]) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="w-4">
            <ProofStrip lines={[{ code: s, cents: 1, status: s }]} size="xs" dark={dark} />
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}
