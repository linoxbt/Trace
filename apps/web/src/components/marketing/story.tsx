"use client";

// "The anatomy of a release": a pinned phone whose screen follows the chapter
// you're reading. IntersectionObserver picks the chapter nearest mid-screen.

import { useEffect, useRef, useState } from "react";
import { Phone, Screen as Frame } from "./phone";
import { TileArt } from "@/components/ui/tile-art";

const CHAPTERS = [
  {
    n: "01",
    title: "Scope it",
    body: "The tradesperson photographs the problem and describes it out loud. Trace drafts priced lines, each with a check a camera can make, and the prices are edited by hand.",
    points: ["One visible outcome per line", "Must-show and must-not-show checks", "Hidden work flagged for review"],
  },
  {
    n: "02",
    title: "Hold it",
    body: "The homeowner approves the scope inside PayPal. The total is authorized on their account, not charged, and the scope is frozen with a hash.",
    points: ["Orders v2 with intent AUTHORIZE", "Held up to 29 days", "Amounts come only from the agreed lines"],
  },
  {
    n: "03",
    title: "Prove it",
    body: "For each line, the tradesperson shoots an after-photo in the app, lined up with a ghost of the before-photo. Location, freshness and reuse are checked before the AI looks.",
    points: ["One-time camera token, 120 s", "150 m geofence", "Verdict with a reason you can read"],
  },
  {
    n: "04",
    title: "Release it",
    body: "PayPal captures exactly the approved lines. Unfinished work stays held until it's fixed, or both sides drop it and the rest goes back.",
    points: ["Partial captures as lines pass", "Final capture releases the remainder", "Every step on the timeline"],
  },
];

export function Story() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:gap-20">
      <ol>
        {CHAPTERS.map((c, i) => (
          <li
            key={c.n}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-i={i}
            className="flex min-h-[70vh] flex-col justify-center border-t border-line py-14 first:border-t-0 lg:min-h-[78vh]"
          >
            <div className={`transition-opacity duration-700 ${active === i ? "opacity-100" : "lg:opacity-35"}`}>
              <div className="clause">{c.n} / 04</div>
              <h3 className="display mt-3 text-[48px] leading-none sm:text-[64px]">{c.title}</h3>
              <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted">{c.body}</p>
              <ul className="mt-6 space-y-2 font-mono text-[12.5px] text-ink-2">
                {c.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5">
                    <span className="h-px w-5 bg-violet" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-10 flex justify-center lg:hidden">
              <Phone>
                <ScreenFor i={i} />
              </Phone>
            </div>
          </li>
        ))}
      </ol>
      <div className="hidden lg:block">
        <div className="sticky top-[calc(50vh-310px)]">
          <Phone>
            {CHAPTERS.map((_, i) => (
              <div key={i} className={`absolute inset-0 transition-all duration-700 ease-[var(--ease-out-expo)] ${active === i ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
                <ScreenFor i={i} />
              </div>
            ))}
          </Phone>
          <div className="mt-6 flex justify-center gap-2" aria-hidden>
            {CHAPTERS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${active === i ? "w-8 bg-violet" : "w-1.5 bg-line-2"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenFor({ i }: { i: number }) {
  if (i === 0) return <ScopeScreen />;
  if (i === 1) return <HoldScreen />;
  if (i === 2) return <ProveScreen />;
  return <ReleaseScreen />;
}

function Head({ k, title }: { k: string; title: string }) {
  return (
    <div className="px-4 pt-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">{k}</div>
      <div className="mt-0.5 text-[15px] font-semibold tracking-tight">{title}</div>
    </div>
  );
}

function ScopeScreen() {
  const lines = [
    ["L1", "Fix dripping tap", "120.00", "Tap closed with a dry spout"],
    ["L2", "Reseal bath edge", "90.00", "Continuous white sealant bead"],
    ["L4", "Regrout shower wall", "110.00", "Continuous grout, no visible cracks"],
  ];
  return (
    <Frame>
      <Head k="New job · draft" title="12 Admiralty Way" />
      <div className="mx-4 mt-3 flex items-center gap-2 rounded-2xl bg-violet-soft px-3 py-2.5 text-[11px] text-violet">
        <span className="flex h-6 items-end gap-[2px]" aria-hidden>
          {[8, 14, 10, 18, 12, 16, 9].map((h, j) => (
            <span key={j} className="w-[3px] animate-pulse-soft rounded-full bg-violet" style={{ height: h, animationDelay: `${j * 120}ms` }} />
          ))}
        </span>
        &ldquo;Grout&apos;s cracked by the shower, tap won&apos;t stop…&rdquo;
      </div>
      <div className="mt-3 space-y-2 px-4">
        {lines.map(([c, t, p, crit]) => (
          <div key={c} className="surface rounded-xl p-3">
            <div className="flex justify-between text-[12px] font-medium">
              <span>
                <span className="num mr-1 text-[10px] text-faint">{c}</span>
                {t}
              </span>
              <span className="num">${p}</span>
            </div>
            <div className="mt-1.5 flex items-start gap-1.5 text-[10.5px] text-muted">
              <span className="mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
              {crit}
            </div>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-4 bottom-5">
        <div className="btn-primary flex h-11 items-center justify-center rounded-full text-[13px] font-medium">Send for approval · $420.00</div>
      </div>
    </Frame>
  );
}

function HoldScreen() {
  return (
    <Frame>
      <Head k="Homeowner" title="Approve and hold" />
      <div className="mx-4 mt-4 rounded-2xl bg-night p-4 text-white">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/50">Held by PayPal</div>
        <div className="num mt-1 text-[32px] font-semibold tracking-tight">$420.00</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-lilac">
          <span className="h-1.5 w-1.5 rounded-full bg-lilac" /> Not charged until verified
        </div>
      </div>
      <ul className="mx-4 mt-4 space-y-2 text-[12px] text-ink-2">
        {["PayPal holds it: nothing is charged now", "Each line is paid only after its photos pass", "Anything unfinished is released back"].map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
            {t}
          </li>
        ))}
      </ul>
      <div className="mx-4 mt-5 rounded-2xl border border-ok/25 bg-ok-soft p-3 text-[12px] text-ok">
        <div className="font-semibold">✓ Authorization created</div>
        <div className="num mt-0.5 text-[10.5px] opacity-80">expires in 29 days · scope hash 7f1c…a2e4</div>
      </div>
    </Frame>
  );
}

function ProveScreen() {
  return (
    <Frame dark>
      <div className="px-4 pt-2 text-center">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/50">Prove it</div>
        <div className="text-[13px] font-medium">L4 · Regrout shower wall</div>
      </div>
      <div className="relative mx-3 mt-3 overflow-hidden rounded-[22px]" style={{ "--bracket": "#c6b5ff" } as React.CSSProperties}>
        <div className="bracket">
          <TileArt state="after" className="block aspect-[3/4] w-full object-cover" />
        </div>
        <TileArt state="before" className="pointer-events-none absolute inset-0 h-full w-full opacity-25 mix-blend-multiply" />
        <div className="absolute inset-0 animate-scan bg-gradient-to-b from-transparent via-lilac/40 to-transparent" />
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] backdrop-blur">Line up with the ghost</div>
      </div>
      <div className="mx-3 mt-3 space-y-1.5 rounded-2xl bg-white/[0.06] p-3 text-[11px]">
        {[["Taken here", "12 m from the job"], ["Taken now", "token 41 s old"], ["Not reused", "nearest match 31 bits"], ["Grout continuous", "no visible cracks"]].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-lilac text-[8px] text-ink">✓</span>
              {k}
            </span>
            <span className="num text-white/50">{v}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ReleaseScreen() {
  const lines = [
    ["L1", "Fix dripping tap", "Paid"],
    ["L2", "Reseal bath edge", "Paid"],
    ["L3", "Refit towel rail", "Paid"],
    ["L4", "Regrout shower wall", "Held"],
  ];
  return (
    <Frame>
      <Head k="Bathroom repair" title="12 Admiralty Way" />
      <div className="mx-4 mt-3 rounded-2xl bg-night p-4 text-white">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/50">Released</div>
        <div className="num mt-1 text-[30px] font-semibold tracking-tight text-lilac">$310.00</div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[74%] rounded-full bg-gradient-to-r from-[#8a63ff] to-lilac" />
        </div>
        <div className="mt-2 flex justify-between text-[10.5px] text-white/55">
          <span>3 lines paid</span>
          <span className="num">$110.00 still held</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 px-4">
        {lines.map(([c, t, s]) => (
          <div key={c} className="flex items-center justify-between rounded-xl border border-line bg-card px-3 py-2.5 text-[12px]">
            <span>
              <span className="num mr-1 text-[10px] text-faint">{c}</span>
              {t}
            </span>
            <span className={`rounded-full px-2 py-[2px] text-[10px] font-medium ${s === "Paid" ? "bg-violet text-white" : "bg-warn-soft text-warn"}`}>{s}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-3 bottom-4 flex h-12 items-center gap-2 rounded-2xl bg-ink px-3.5 text-[11px] font-medium text-white">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-lilac text-[10px] text-ink">✓</span>
        PayPal captured $310.00
      </div>
    </Frame>
  );
}
