"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDisc } from "@/components/marketing/blocks";
import { TapArt } from "@/components/ui/job-art";
import { Mark } from "@/components/logo";

// The four steps of a job as a stack of cards: one open, the rest folded to a
// spine with their name turned on its side. Hover or tap a spine to open it.

type Step = { n: string; name: string; title: string; body: string; points: string[]; cta: { href: string; label: string }; mock: React.ReactNode };

function HoldMock() {
  const lines: [string, string][] = [["L1 · Fix dripping tap", "120.00"], ["L2 · Reseal bath edge", "90.00"], ["L3 · Refit towel rail", "100.00"], ["L4 · Regrout shower wall", "110.00"]];
  return (
    <div className="clay w-full max-w-[340px] rounded-[22px] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#003087] text-[11px] font-bold italic text-white">P</span>
          <span className="text-[13px] font-semibold">Authorization</span>
        </div>
        <span className="rounded-full bg-violet-soft px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-violet">HELD</span>
      </div>
      <div className="num mt-4 text-[30px] font-semibold">$420.00</div>
      <div className="text-[11.5px] text-muted">Orders v2 · intent AUTHORIZE · honoured 3 days</div>
      <ul className="mt-4 space-y-2 border-t border-line pt-3">
        {lines.map(([k, v]) => (
          <li key={k} className="flex justify-between text-[12.5px]">
            <span className="text-ink-2">{k}</span>
            <span className="num text-muted">${v}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex h-9 items-center justify-center gap-2 rounded-full bg-ink text-[12.5px] font-semibold text-white">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="m5 12.5 4.2 4L19 7" /></svg>
        Approved in PayPal
      </div>
    </div>
  );
}

function ProveMock() {
  return (
    <div className="relative w-full max-w-[320px] overflow-hidden rounded-[26px] bg-night p-3 shadow-[0_30px_60px_-24px_rgb(22_18_29/0.6)]">
      <div className="bracket overflow-hidden rounded-[18px]" style={{ "--bracket": "#fff" } as React.CSSProperties}>
        <TapArt state="after" className="block aspect-[4/3] w-full" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10.5px] text-white/80">
        <span className="rounded-full bg-white/10 px-2 py-1">● 12 m from job</span>
        <span className="rounded-full bg-white/10 px-2 py-1">GPS ±8 m</span>
        <span className="rounded-full bg-white/10 px-2 py-1">token 0:41</span>
      </div>
      <div className="mt-3 flex items-center justify-between px-1 pb-1">
        <span className="text-[12px] text-white/60">L1 · Fix dripping tap</span>
        <span className="grid h-12 w-12 place-items-center rounded-full border-[3px] border-white/80">
          <span className="h-9 w-9 rounded-full bg-white" />
        </span>
      </div>
    </div>
  );
}

function VerifyMock() {
  const checks = ["Taken here · 12 m", "Taken now · 41 s", "Not reused · 31 of 64", "Tap closed, spout dry"];
  return (
    <div className="clay w-full max-w-[340px] rounded-[22px] p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">Inspection</span>
        <span className="stamp text-ok">✓ Verified</span>
      </div>
      <div className="mt-3 text-[15px] font-semibold">L1 · Fix dripping tap</div>
      <ul className="mt-3 space-y-2">
        {checks.map((c) => (
          <li key={c} className="flex items-center gap-2.5 text-[12.5px]">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-ok-soft text-ok">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m5 12.5 4.2 4L19 7" /></svg>
            </span>
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <div className="flex justify-between font-mono text-[10.5px] text-muted">
          <span>Model confidence</span>
          <span>0.94 · needs 0.80</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper">
          <div className="h-full w-[94%] rounded-full bg-gradient-to-r from-violet to-violet-bright" />
        </div>
      </div>
    </div>
  );
}

function ReleaseMock() {
  const bars = [
    { h: 52, c: "bg-violet", l: "L1" },
    { h: 40, c: "bg-violet", l: "L2" },
    { h: 46, c: "bg-violet", l: "L3" },
    { h: 50, c: "bg-brass/70", l: "L4" },
  ];
  return (
    <div className="clay w-full max-w-[360px] overflow-hidden rounded-[22px]">
      <div className="flex">
        <div className="flex w-12 flex-col items-center gap-3 bg-night py-4">
          <Mark size={22} />
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 w-5 rounded-full ${i === 0 ? "bg-lilac" : "bg-white/20"}`} />
          ))}
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">Job ledger</span>
            <span className="rounded-full bg-ok-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-ok">LIVE</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-paper p-2.5">
              <div className="text-[10px] text-muted">Released</div>
              <div className="num text-[17px] font-semibold text-violet">$310.00</div>
            </div>
            <div className="rounded-xl bg-paper p-2.5">
              <div className="text-[10px] text-muted">Still held</div>
              <div className="num text-[17px] font-semibold">$110.00</div>
            </div>
          </div>
          <div className="mt-4 flex h-[64px] items-end gap-2.5">
            {bars.map((b) => (
              <div key={b.l} className="flex flex-1 flex-col items-center gap-1">
                <div className={`w-full rounded-md ${b.c}`} style={{ height: b.h }} />
                <span className="font-mono text-[9.5px] text-muted">{b.l}</span>
              </div>
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 border-t border-line pt-2.5 text-[11.5px]">
            <li className="flex justify-between"><span className="text-muted">Capture 1 · final: false</span><span className="num">$310.00</span></li>
            <li className="flex justify-between"><span className="text-muted">L4 · crack above soap dish</span><span className="num text-brass">held</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const STEPS: Step[] = [
  {
    n: "01",
    name: "Hold",
    title: "The money is held, not paid.",
    body: "The homeowner approves a scope of priced lines and PayPal authorizes the total. Nothing is charged yet.",
    points: ["One authorization per job", "Priced line by line", "Held by PayPal, never by Trace", "Visible to the trade before they start"],
    cta: { href: "/homeowners", label: "For homeowners" },
    mock: <HoldMock />,
  },
  {
    n: "02",
    name: "Prove",
    title: "A photo from the job, right now.",
    body: "The tradesperson opens a one-time camera for a line and photographs the finished work on site.",
    points: ["One-time token, valid 120 s", "Within 150 m of the job", "Same phone that started the job", "Before and after kept together"],
    cta: { href: "/tradespeople", label: "For tradespeople" },
    mock: <ProveMock />,
  },
  {
    n: "03",
    name: "Verify",
    title: "Checked by code, then by AI.",
    body: "Location, freshness and reuse are checked on the server first. Then the AI compares the photo against the line's written criterion.",
    points: ["0.80 confidence to pass", "A second look on a 2× crop", "Unsure goes to the homeowner", "Reasons in plain words"],
    cta: { href: "/security", label: "Every check" },
    mock: <VerifyMock />,
  },
  {
    n: "04",
    name: "Release",
    title: "Paid line by line.",
    body: "Each proved line is captured from the hold. The last capture is final and frees whatever is left.",
    points: ["Partial captures as lines pass", "Never more than the hold", "Final capture releases the rest", "Recorded before it's sent"],
    cta: { href: "/how-it-works", label: "The money rules" },
    mock: <ReleaseMock />,
  },
];

export function StepsStack() {
  const [open, setOpen] = useState(0);
  return (
    <>
      {/* Desktop: a row of cards, one open. */}
      <div className="hidden h-[480px] gap-3 lg:flex">
        {STEPS.map((s, i) => {
          const on = i === open;
          return (
            <div
              key={s.n}
              onMouseEnter={() => setOpen(i)}
              onClick={() => setOpen(i)}
              className={`clay relative overflow-hidden rounded-[30px] transition-[flex-basis,flex-grow] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${on ? "" : "cursor-pointer hover:bg-white"}`}
              style={{ flex: on ? "1 1 0%" : "0 0 78px" }}
              data-cursor={on ? undefined : "Open"}
            >
              {/* Spine */}
              <div className={`absolute inset-0 flex flex-col items-center pt-6 transition-opacity duration-300 ${on ? "pointer-events-none opacity-0" : "opacity-100 delay-300"}`}>
                <span className="font-mono text-[11px] text-violet">{s.n}</span>
                <span className="display mt-5 text-[22px] [writing-mode:vertical-rl]">{s.name}</span>
              </div>
              {/* Open card */}
              <div className={`grid h-full grid-cols-[1fr_minmax(300px,1fr)] items-center gap-8 p-10 transition-opacity duration-500 ${on ? "opacity-100 delay-300" : "pointer-events-none opacity-0"}`}>
                <div className="min-w-[280px]">
                  <span className="font-mono text-[11px] text-violet">
                    {s.n} / 04 · {s.name}
                  </span>
                  <h3 className="display mt-4 text-[34px] leading-[1.02]">{s.title}</h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
                  <ul className="mt-5 space-y-2">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <Link href={s.cta.href} className="pill press btn-primary mt-7 inline-flex h-11 items-center gap-2.5 rounded-full pl-5 pr-1.5 text-[13.5px] font-semibold">
                    {s.cta.label} <ArrowDisc tone="white" size={32} />
                  </Link>
                </div>
                <div className="flex justify-center">{s.mock}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Phones and tablets: the same cards as an accordion. */}
      <div className="space-y-3 lg:hidden">
        {STEPS.map((s, i) => {
          const on = i === open;
          return (
            <div key={s.n} className="clay overflow-hidden rounded-[26px]">
              <button className="flex w-full items-center gap-4 px-5 py-4 text-left" aria-expanded={on} onClick={() => setOpen(i)}>
                <span className="font-mono text-[11px] text-violet">{s.n}</span>
                <span className="display flex-1 text-[24px]">{s.name}</span>
                <span className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${on ? "bg-violet text-white" : "bg-paper"}`} aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className={`transition-transform duration-500 ${on ? "rotate-90" : ""}`}>
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </span>
              </button>
              <div className="grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ gridTemplateRows: on ? "1fr" : "0fr" }}>
                <div className="overflow-hidden">
                  <div className="px-5 pb-6">
                    <h3 className="display text-[28px] leading-[1.05]">{s.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
                    <div className="mt-6 flex justify-center">{s.mock}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
