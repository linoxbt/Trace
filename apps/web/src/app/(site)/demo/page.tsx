import type { Metadata } from "next";
import { Demo } from "@/components/demo/demo";
import { Eyebrow, FloatDots, PillLink } from "@/components/marketing/blocks";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Run a whole Trace job in your browser: approve the hold, prove the work, release the money. Simulated, nothing charged.",
};

export default function DemoPage() {
  return (
    <section className="relative pb-24 pt-28 sm:pt-32">
      <div className="gridlines pointer-events-none absolute inset-0 -z-10" />
      <FloatDots count={16} />
      <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        <div className="rise">
          <Eyebrow>Live demo · simulated</Eyebrow>
        </div>
        <h1 className="display rise mt-5 max-w-3xl text-[48px] leading-[0.95] sm:text-[76px]" style={{ "--delay": "60ms" } as React.CSSProperties}>
          Run a job, <span className="text-violet">start to finish.</span>
        </h1>
        <p className="rise mt-5 max-w-2xl text-[17px] leading-relaxed text-muted sm:text-[18px]" style={{ "--delay": "120ms" } as React.CSSProperties}>
          A $420 bathroom repair in four lines. Play the homeowner and the tradesperson, and watch the hold turn into payments one proved line at a time.
        </p>
        <div className="rise mt-6 flex flex-wrap items-center gap-3" style={{ "--delay": "150ms" } as React.CSSProperties}>
          <PillLink href="/try" tone="ink">
            Run it for real
          </PillLink>
          <span className="text-[14px] text-muted">Your own copy, a real PayPal sandbox hold and the real AI check. No sign-up.</span>
        </div>
      </div>
      <div className="rise mt-10 px-3 sm:px-8" style={{ "--delay": "180ms" } as React.CSSProperties}>
        <Demo />
      </div>
    </section>
  );
}
