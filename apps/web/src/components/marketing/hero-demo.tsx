"use client";

// The hero's live demo: one loop of the product's climax. Four lines are
// checked from photos, the grout fails, PayPal captures $310 while $110 stays
// held, the grout is redone and the last $110 is captured. The phone, the
// photo-check card and the PayPal ledger all read the same state.

import { useEffect, useState } from "react";
import { Money } from "@/components/ui/count";
import { TileArt } from "@/components/ui/tile-art";

type S = "PENDING" | "PROVING" | "VERIFIED" | "FAILED" | "PAID";

const LINES = [
  { code: "L1", title: "Fix dripping tap", cents: 12000 },
  { code: "L2", title: "Reseal bath edge", cents: 9000 },
  { code: "L3", title: "Refit towel rail", cents: 10000 },
  { code: "L4", title: "Regrout shower wall", cents: 11000 },
];

interface Frame {
  lines: S[];
  released: number;
  captures: { cents: number; final: boolean }[];
  toast: string | null;
  grout: "idle" | "scanning" | "failed" | "verified";
}

const at = (lines: S[], rest: Partial<Frame> = {}): Frame => ({
  lines,
  released: 0,
  captures: [],
  toast: null,
  grout: "idle",
  ...rest,
});

const ONE = [{ cents: 31000, final: false }];
const TWO = [...ONE, { cents: 11000, final: true }];

// [time in ms, frame]
const SCRIPT: [number, Frame][] = [
  [0, at(["PENDING", "PENDING", "PENDING", "PENDING"])],
  [700, at(["PROVING", "PENDING", "PENDING", "PENDING"])],
  [1700, at(["VERIFIED", "PENDING", "PENDING", "PENDING"])],
  [2000, at(["VERIFIED", "PROVING", "PENDING", "PENDING"])],
  [2900, at(["VERIFIED", "VERIFIED", "PENDING", "PENDING"])],
  [3200, at(["VERIFIED", "VERIFIED", "PROVING", "PENDING"])],
  [4100, at(["VERIFIED", "VERIFIED", "VERIFIED", "PENDING"])],
  [4400, at(["VERIFIED", "VERIFIED", "VERIFIED", "PROVING"], { grout: "scanning" })],
  [5600, at(["VERIFIED", "VERIFIED", "VERIFIED", "FAILED"], { grout: "failed" })],
  [6600, at(["VERIFIED", "VERIFIED", "VERIFIED", "FAILED"], { grout: "failed", toast: "Releasing verified work…" })],
  [7300, at(["PAID", "PAID", "PAID", "FAILED"], { grout: "failed", released: 31000, captures: ONE, toast: "PayPal captured $310.00 · $110.00 still held" })],
  [9600, at(["PAID", "PAID", "PAID", "PROVING"], { grout: "scanning", released: 31000, captures: ONE })],
  [10800, at(["PAID", "PAID", "PAID", "VERIFIED"], { grout: "verified", released: 31000, captures: ONE })],
  [11500, at(["PAID", "PAID", "PAID", "PAID"], { grout: "verified", released: 42000, captures: TWO, toast: "Final capture $110.00 · Job complete" })],
];
const LOOP = 14500;
const FINAL = SCRIPT[SCRIPT.length - 1]![1];

function useScript(): Frame {
  const [frame, setFrame] = useState<Frame>(SCRIPT[0]![1]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(FINAL);
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers = SCRIPT.map(([t, f]) => setTimeout(() => setFrame(f), t));
      timers.push(setTimeout(run, LOOP));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);
  return frame;
}

const CHIP: Record<S, { label: string; cls: string; icon: string }> = {
  PENDING: { label: "Pending", cls: "bg-paper-2 text-muted", icon: "○" },
  PROVING: { label: "Checking", cls: "bg-violet-soft text-violet", icon: "◌" },
  VERIFIED: { label: "Verified", cls: "bg-ok-soft text-ok", icon: "✓" },
  FAILED: { label: "Failed", cls: "bg-bad-soft text-bad", icon: "✕" },
  PAID: { label: "Paid", cls: "bg-violet text-white", icon: "●" },
};

function Chip({ s }: { s: S }) {
  const c = CHIP[s];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-medium transition-colors duration-500 ${c.cls}`}>
      <span aria-hidden className={s === "PROVING" ? "animate-spin" : ""} style={s === "PROVING" ? { animationDuration: "1.2s" } : undefined}>
        {c.icon}
      </span>
      {c.label}
    </span>
  );
}

export function HeroDemo() {
  const f = useScript();
  const held = 42000;
  const still = held - f.released;
  const pct = (f.released / held) * 100;

  return (
    <div
      className="relative mx-auto grid w-full items-center justify-items-center gap-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-10"
      aria-label="Animated demo: $310 released for verified work while $110 stays held"
    >
      {/* Photo check on L4 */}
      <div className="surface hidden w-[248px] -rotate-2 rounded-2xl p-3.5 lg:block lg:justify-self-end">
        <div className="flex items-center justify-between text-[11.5px]">
          <span className="font-semibold">L4 · Grout check</span>
          <span
            className={`rounded-full px-2 py-[2px] text-[10.5px] font-medium transition-colors duration-500 ${
              f.grout === "verified" ? "bg-ok-soft text-ok" : f.grout === "failed" ? "bg-bad-soft text-bad" : "bg-violet-soft text-violet"
            }`}
          >
            {f.grout === "verified" ? "Verified" : f.grout === "failed" ? "Failed" : f.grout === "scanning" ? "Inspecting" : "Waiting"}
          </span>
        </div>
        <div className="bracket mt-2.5 overflow-hidden rounded-lg">
          <div className="relative">
            <TileArt state={f.grout === "verified" ? "after" : "before"} highlight={f.grout === "failed"} className="block aspect-[4/3] w-full" />
            {f.grout === "scanning" && <div className="absolute inset-0 animate-scan bg-gradient-to-b from-transparent via-lilac/50 to-transparent" />}
          </div>
        </div>
        <ul className="mt-2.5 space-y-1.5 text-[11px]">
          <Check ok={f.grout !== "failed"} pending={f.grout === "idle" || f.grout === "scanning"} text={f.grout === "failed" ? "Crack above the soap dish" : "No visible cracks"} />
          <Check ok pending={f.grout === "idle"} text="Same wall, 12 m from the job" />
          <Check ok pending={f.grout === "idle"} text="Fresh photo, one-time token" />
        </ul>
      </div>

      {/* Phone */}
      <div className="relative w-[300px] rounded-[46px] bg-[#0d0a12] p-[10px] shadow-[0_60px_120px_-30px_rgba(10,4,30,0.8),0_0_0_1px_rgba(255,255,255,0.08)_inset] sm:w-[320px]">
        <div className="relative overflow-hidden rounded-[37px] bg-paper">
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-ink">
            <span className="num">9:41</span>
            <span className="h-[22px] w-[86px] rounded-full bg-[#0d0a12]" />
            <span className="h-2 w-3.5 rounded-[2px] border border-ink" />
          </div>

          <div className="px-4 pb-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">Bathroom repair</div>
                <div className="mt-0.5 text-[15px] font-semibold tracking-tight">12 Admiralty Way</div>
              </div>
              <span className="rounded-full bg-violet-soft px-2 py-[3px] text-[10px] font-medium text-violet">
                {f.released === held ? "Complete" : f.released ? "Part released" : "Money held"}
              </span>
            </div>

            <div className="mt-3 rounded-2xl bg-night p-3 text-white">
              <div className="grid grid-cols-3 gap-1">
                <Fig label="Held" cents={held} />
                <Fig label="Released" cents={f.released} accent />
                <Fig label="Still held" cents={still} />
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[#8a63ff] to-lilac transition-[width] duration-[1200ms] ease-[var(--ease-out-expo)]" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {LINES.map((l, i) => {
                const s = f.lines[i]!;
                return (
                  <div
                    key={l.code}
                    className={`relative flex items-center justify-between overflow-hidden rounded-xl border bg-card px-3 py-2.5 transition-colors duration-500 ${
                      s === "FAILED" ? "border-bad/30" : s === "PROVING" ? "border-violet/40" : "border-line"
                    }`}
                  >
                    {s === "PROVING" && <div className="pointer-events-none absolute inset-x-0 top-0 h-full animate-scan bg-gradient-to-b from-transparent via-violet/10 to-transparent" />}
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium">
                        <span className="num mr-1 text-[10px] text-faint">{l.code}</span>
                        {l.title}
                      </div>
                      <div className="num mt-0.5 text-[11px] text-muted">${(l.cents / 100).toFixed(2)}</div>
                    </div>
                    <Chip s={s} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-3 bottom-3 h-12">
            {f.toast && (
              <div key={f.toast} className="toast-in flex h-full items-center gap-2 rounded-2xl bg-ink px-3.5 text-[11px] font-medium text-white shadow-lg">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-lilac text-[10px] text-ink">✓</span>
                {f.toast}
              </div>
            )}
          </div>
          <div className="h-14" />
        </div>
      </div>

      {/* PayPal ledger */}
      <div className="hidden w-[248px] rotate-2 rounded-2xl border border-white/15 bg-night/80 p-4 text-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur lg:block lg:justify-self-start">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/50">
          <span>PayPal ledger</span>
          <span className="flex items-center gap-1 normal-case tracking-normal text-lilac">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-lilac" /> live
          </span>
        </div>
        <Row k="Authorization" v="$420.00" sub="held, not charged" />
        {f.captures.map((c, i) => (
          <div key={i} className="toast-in">
            <Row k={`Capture ${i + 1}`} v={`$${(c.cents / 100).toFixed(2)}`} sub={c.final ? "final_capture: true" : "final_capture: false"} accent />
          </div>
        ))}
        <div className="mt-3 border-t border-white/10 pt-2.5 text-[11px] text-white/60">
          Still held <Money cents={still} className="ml-1 text-white" />
        </div>
      </div>
    </div>
  );
}

function Fig({ label, cents, accent }: { label: string; cents: number; accent?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-medium uppercase tracking-[0.1em] text-white/45">{label}</div>
      <Money cents={cents} className={`mt-0.5 block text-[13px] font-semibold ${accent ? "text-lilac" : "text-white"}`} />
    </div>
  );
}

function Check({ ok, pending, text }: { ok: boolean; pending?: boolean; text: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[8px] transition-colors duration-500 ${
          pending ? "bg-paper-2 text-faint" : ok ? "bg-ok text-white" : "bg-bad text-white"
        }`}
        aria-hidden
      >
        {pending ? "·" : ok ? "✓" : "✕"}
      </span>
      <span className={pending ? "text-faint" : "text-ink-2"}>{text}</span>
    </li>
  );
}

function Row({ k, v, sub, accent }: { k: string; v: string; sub: string; accent?: boolean }) {
  return (
    <div className="mt-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="text-[11.5px] font-medium">{k}</div>
        <div className="num text-[9.5px] text-white/45">{sub}</div>
      </div>
      <div className={`num text-[12px] font-semibold ${accent ? "text-lilac" : ""}`}>{v}</div>
    </div>
  );
}
