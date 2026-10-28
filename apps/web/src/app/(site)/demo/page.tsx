import type { Metadata } from "next";
import { Demo } from "@/components/demo/demo";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Run a whole Trace job in your browser: approve the hold, prove the work, release the money. Simulated, nothing charged.",
};

export default function DemoPage() {
  return (
    <section className="relative pb-24 pt-28 sm:pt-32">
      <div className="gridlines pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="clause rise">Live demo · simulated</p>
        <h1 className="display rise mt-4 max-w-3xl text-[48px] leading-[0.95] tracking-[-0.02em] sm:text-[72px]" style={{ "--delay": "60ms" } as React.CSSProperties}>
          Run a job, <span className="italic text-violet">start to finish.</span>
        </h1>
        <p className="rise mt-5 max-w-2xl text-[17px] leading-relaxed text-muted sm:text-[18px]" style={{ "--delay": "120ms" } as React.CSSProperties}>
          A $420 bathroom repair in four lines. Play the homeowner and the tradesperson, and watch the hold turn into payments one proved line at a time.
        </p>
      </div>
      <div className="rise mt-10 px-3 sm:px-8" style={{ "--delay": "180ms" } as React.CSSProperties}>
        <Demo />
      </div>
    </section>
  );
}
