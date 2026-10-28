"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDisc } from "@/components/marketing/blocks";

// "See where you fit": one tab per way into a job. The active tab fills a
// progress bar and hands over to the next; its panel walks the journey one
// node at a time, with a floating card for the moment that matters.

type Node = { label: string; icon: React.ReactNode };
type Party = {
  key: string;
  title: string;
  sub: string;
  icon: React.ReactNode;
  panel: { title: string; body: string; chip: string };
  card: { title: string; meta: string; status: string; tone: "ok" | "violet" | "warn" };
  nodes: Node[];
  footer: string;
  href: string;
  cta: string;
};

const s = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const I = {
  home: <svg {...s}><path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5V11Z" /></svg>,
  wrench: <svg {...s}><path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L12 17.8a2.1 2.1 0 1 1-3-3l7.4-7.4a4 4 0 0 1-1.9-1.9Z" /><path d="m6 18-2 2" /></svg>,
  flag: <svg {...s}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>,
  lock: <svg {...s}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>,
  camera: <svg {...s}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" /><circle cx="12" cy="13" r="3.3" /></svg>,
  check: <svg {...s}><path d="m5 12.5 4.2 4L19 7" /></svg>,
  coin: <svg {...s}><circle cx="12" cy="12" r="8" /><path d="M12 7.5v9M9.5 10a2.5 2 0 0 1 5 0c0 2.5-5 1.5-5 4a2.5 2 0 0 0 5 0" /></svg>,
  eye: <svg {...s}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>,
  redo: <svg {...s}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>,
  doc: <svg {...s}><path d="M7 3.5h7l4 4V20H7V3.5Z" /><path d="M14 3.5V8h4M9.5 12h5M9.5 15h5" /></svg>,
};

const PARTIES: Party[] = [
  {
    key: "home",
    title: "Homeowner",
    sub: "Approve a scope, pay for what's proved",
    icon: I.home,
    panel: { title: "The homeowner's job", body: "From the quote to the last line, every dollar waits in PayPal until a photo from your home shows the work is done.", chip: "Homeowner journey" },
    card: { title: "Bathroom repair", meta: "4 lines · $420.00", status: "Held in PayPal", tone: "violet" },
    nodes: [
      { label: "Approve hold", icon: I.lock },
      { label: "Photos in", icon: I.camera },
      { label: "Review lines", icon: I.eye },
      { label: "Release", icon: I.coin },
    ],
    footer: "Nothing charged until a line is proved",
    href: "/homeowners",
    cta: "More for homeowners",
  },
  {
    key: "trades",
    title: "Tradesperson",
    sub: "Know the money's there, get paid as you finish",
    icon: I.wrench,
    panel: { title: "The tradesperson's day", body: "See the hold before you buy materials. Prove each line from the job's phone and get paid for it while you pack up.", chip: "Trades journey" },
    card: { title: "L1 · Fix dripping tap", meta: "Photo 12 m from the job", status: "Verified", tone: "ok" },
    nodes: [
      { label: "See the hold", icon: I.lock },
      { label: "Take photo", icon: I.camera },
      { label: "Verified", icon: I.check },
      { label: "Paid $310", icon: I.coin },
    ],
    footer: "Every proved line is released, line by line",
    href: "/tradespeople",
    cta: "More for tradespeople",
  },
  {
    key: "fix",
    title: "When a line fails",
    sub: "The money waits while it's put right",
    icon: I.flag,
    panel: { title: "When the grout cracks", body: "A failed line keeps its money held, says why, and pays the moment it's redone. The photo log answers any dispute.", chip: "Fix it, then paid" },
    card: { title: "L4 · Regrout shower wall", meta: "Crack above the soap dish", status: "$110 still held", tone: "warn" },
    nodes: [
      { label: "Line fails", icon: I.flag },
      { label: "Redo work", icon: I.redo },
      { label: "Re-proved", icon: I.check },
      { label: "Evidence kept", icon: I.doc },
    ],
    footer: "Disputes answered with the photo record",
    href: "/how-it-works",
    cta: "How a failed line is handled",
  },
];

const DURATION = 6000;

export function PartyTabs() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % PARTIES.length), DURATION);
    return () => clearTimeout(t);
  }, [active, cycle, inView]);

  const pick = (i: number) => {
    setActive(i);
    setCycle((c) => c + 1);
  };
  const p = PARTIES[active]!;

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[380px_1fr] lg:gap-10">
      <div className="space-y-3" role="tablist" aria-label="Who you are">
        {PARTIES.map((x, i) => {
          const on = i === active;
          return (
            <button
              key={x.key}
              role="tab"
              aria-selected={on}
              onClick={() => pick(i)}
              className={`relative flex w-full items-center gap-4 overflow-hidden rounded-[22px] p-4 text-left transition-all duration-500 ${
                on ? "clay ring-2 ring-violet/60" : "bg-white/60 hover:bg-white"
              }`}
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-colors duration-500 ${on ? "bg-violet text-white" : "bg-paper text-ink-2"}`}>{x.icon}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15.5px] font-semibold ${on ? "text-violet" : ""}`}>{x.title}</span>
                <span className="block text-[13px] text-muted">{x.sub}</span>
              </span>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors ${on ? "border-violet bg-violet text-white" : "border-line-2 text-muted"}`} aria-hidden>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </span>
              {on && inView && (
                <span key={`${active}-${cycle}`} className="absolute bottom-0 left-4 h-[3px] rounded-full bg-violet" style={{ animation: `grow ${DURATION}ms linear both`, maxWidth: "calc(100% - 32px)" }} />
              )}
            </button>
          );
        })}
        <Link href={p.href} className="pill press btn-light mt-4 inline-flex h-12 items-center gap-3 rounded-full pl-5 pr-1.5 text-[14px] font-semibold">
          {p.cta} <ArrowDisc size={34} />
        </Link>
      </div>

      <div className="clay relative overflow-hidden rounded-[32px] p-6 sm:p-10" role="tabpanel" aria-label={p.panel.title}>
        <div className="dots pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,transparent,black_60%)]" />
        <div key={p.key} className="relative">
          <h3 className="display text-[28px] leading-tight sm:text-[34px]" style={{ animation: "rise .8s var(--ease-out-expo) both" }}>
            {p.panel.title}
          </h3>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted" style={{ animation: "rise .8s var(--ease-out-expo) 80ms both" }}>
            {p.panel.body}
          </p>
          <span className="mt-4 inline-block rounded-full bg-violet-soft px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-violet">{p.panel.chip}</span>

          {/* The moment that matters, as a floating card. */}
          <div className="mt-8 flex justify-end sm:-mt-24">
            <div className="clay w-[220px] rotate-[2deg] rounded-2xl p-4" style={{ animation: "rise .9s var(--ease-out-expo) 200ms both" }}>
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-paper text-violet">{p.icon}</span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{p.card.title}</div>
                  <div className="text-[11px] text-muted">{p.card.meta}</div>
                </div>
              </div>
              <div
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  p.card.tone === "ok" ? "bg-ok-soft text-ok" : p.card.tone === "warn" ? "bg-warn-soft text-warn" : "bg-violet-soft text-violet"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> {p.card.status}
              </div>
            </div>
          </div>

          {/* The journey: nodes light in turn as the line draws through them. */}
          <div className="relative mt-10">
            <div className="absolute left-[12.5%] right-[12.5%] top-6 h-[2px] rounded bg-line" />
            <div className="absolute left-[12.5%] top-6 h-[2px] rounded bg-violet" style={{ animation: `grow-75 ${DURATION * 0.75}ms var(--ease-out-expo) both` }} />
            <ol className="relative grid grid-cols-4">
              {p.nodes.map((n, i) => (
                <li key={n.label} className="flex flex-col items-center text-center">
                  <span
                    className="grid h-12 w-12 place-items-center rounded-full border-4 border-white bg-violet text-white shadow-[0_8px_20px_-8px_rgb(91_47_214/0.6)]"
                    style={{ animation: `node-in .7s var(--ease-spring) ${300 + i * (DURATION * 0.18)}ms both` }}
                  >
                    {n.icon}
                  </span>
                  <span className="mt-2.5 text-[12px] font-medium text-ink-2 sm:text-[13px]">{n.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl bg-violet-soft px-5 py-3.5">
            <span className="text-[13.5px] font-semibold text-violet">{p.footer}</span>
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-2.5 w-2.5 rounded-full bg-violet" style={{ animation: `dot-on .5s ease ${600 + i * (DURATION * 0.18)}ms both` }} />
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
