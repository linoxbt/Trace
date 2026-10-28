"use client";

import { useEffect, useRef, useState } from "react";
import { ART } from "@/components/ui/job-art";
import { Reveal } from "@/components/ui/reveal";

// The demo job's four lines as a gallery of proved work. Each card shows the
// after-photo; hovering (or tapping) wipes the before-photo across it.

type Code = keyof typeof ART;
const JOBS: { code: Code; title: string; trade: string; price: string; status: string; tone: "ok" | "warn"; span: string }[] = [
  { code: "L1", title: "Fix dripping tap", trade: "Plumbing", price: "$120", status: "Verified · released", tone: "ok", span: "lg:col-span-7" },
  { code: "L2", title: "Reseal bath edge", trade: "Sealant", price: "$90", status: "Reviewed · released", tone: "ok", span: "lg:col-span-5" },
  { code: "L3", title: "Refit towel rail", trade: "Fixtures", price: "$100", status: "Verified · released", tone: "ok", span: "lg:col-span-5" },
  { code: "L4", title: "Regrout shower wall", trade: "Tiling", price: "$110", status: "Failed once · re-proved", tone: "warn", span: "lg:col-span-7" },
];

function Card({ job }: { job: (typeof JOBS)[number] }) {
  const Art = ART[job.code];
  const [wipe, setWipe] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // On touch screens, show the before-photo once as the card scrolls in.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(hover: hover)").matches) return;
    const io = new IntersectionObserver(([e]) => setWipe(!!e?.isIntersecting && (e.intersectionRatio ?? 0) > 0.9), { threshold: [0, 0.9] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="group" onMouseEnter={() => setWipe(true)} onMouseLeave={() => setWipe(false)} data-cursor="Before">
      <div className="clay relative overflow-hidden rounded-[28px] p-2.5">
        <div className="relative aspect-[16/10] overflow-hidden rounded-[20px]">
          <Art state="after" className="absolute inset-0 h-full w-full transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]" />
          <div
            className="absolute inset-0 transition-[clip-path] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ clipPath: wipe ? "inset(0 50% 0 0)" : "inset(0 100% 0 0)" }}
          >
            <Art state="before" className="absolute inset-0 h-full w-full" />
            <span className="absolute bottom-3 left-3 rounded-full bg-ink/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white">Before</span>
          </div>
          <span
            className="absolute inset-y-0 w-[3px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.05)] transition-[left,opacity] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ left: wipe ? "calc(50% - 1.5px)" : "-3px", opacity: wipe ? 1 : 0 }}
          />
          <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink">After</span>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-violet" />
            {job.trade}
          </span>
        </div>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4 px-1">
        <div>
          <h3 className="display text-[24px] leading-tight sm:text-[28px]">{job.title}</h3>
          <span className={`mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium ${job.tone === "ok" ? "text-ok" : "text-warn"}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {job.status}
          </span>
        </div>
        <span className="num pt-1.5 text-[14px] text-muted">
          {job.code} · {job.price}
        </span>
      </div>
    </div>
  );
}

export function JobsGallery() {
  return (
    <div className="grid gap-x-6 gap-y-12 lg:grid-cols-12">
      {JOBS.map((j, i) => (
        <Reveal key={j.code} delay={(i % 2) * 120} className={j.span}>
          <Card job={j} />
        </Reveal>
      ))}
    </div>
  );
}
