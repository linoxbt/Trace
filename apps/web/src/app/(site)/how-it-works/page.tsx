import type { Metadata } from "next";
import { Cta, Faq, PageHero, SectionHead, PillLink } from "@/components/marketing/blocks";
import { Story } from "@/components/marketing/story";
import { Receipt } from "@/components/marketing/receipt";
import { Reveal } from "@/components/ui/reveal";
import Link from "next/link";

export const metadata: Metadata = { title: "How it works", description: "Scope it, hold it, prove it, release it: how a Trace job moves from a dripping tap to a paid invoice." };

const RULES: [string, string][] = [
  ["The hold is the ceiling", "Trace never captures more than PayPal authorized. Before every capture, the amount already captured plus the lines being released is checked against the hold."],
  ["Only approved lines are paid", "A line is released when the homeowner approves it, or when its review window lapses and the AI verified it. A line marked Needs review is never released by silence."],
  ["A capture is final only when nothing is open", "Captures go through with final_capture: false while any line is still being worked on. The last one is final, which tells PayPal to release whatever is left."],
  ["Dropped lines go back", "When both sides agree to drop a line, its share of the hold is released to the homeowner, by the final capture or a void."],
  ["Recorded before sent", "Every capture is written down with its own PayPal-Request-Id before it is sent. If the answer is lost, it is retried with the same ID and PayPal returns the original, never a second charge."],
  ["Renewed once if the job runs long", "PayPal honours a hold best in its first 3 days. After that, Trace asks PayPal to renew it once. If PayPal refuses, both sides are told."],
];

const FAQ: [string, string][] = [
  ["How long can money be held?", "Up to 29 days. Trace is built for jobs that finish within a few days, and asks PayPal to renew the hold once if work runs past the 3-day honour period."],
  ["What does the AI actually decide?", "Nothing about money. It reports what it sees in the photos against the agreed checks. Code turns that into Verified, Needs review or Failed, and the homeowner decides anything uncertain."],
  ["Can the scope change after approval?", "Not silently. Sending the scope freezes it with a hash that goes into the PayPal order. A change is a new, separately approved hold."],
  ["What if PayPal declines a capture?", "Nothing is charged, the lines go back to approved, and both sides see what happened on the timeline."],
];

export default function HowItWorks() {
  return (
    <>
      <PageHero
        clause="How it works"
        title={
          <>
            From a dripping tap to a <span className="text-violet">paid invoice.</span>
          </>
        }
        lede="Trace turns a home repair into a short contract a camera can check, then lets PayPal move the money only as each line is proved."
      >
        <PillLink href="/demo" tone="ink">
          Run it yourself in the demo
        </PillLink>
      </PageHero>

      <section className="pb-12">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Story />
        </div>
      </section>

      <section className="grain relative mx-3 overflow-hidden rounded-[40px] bg-night sm:mx-5 py-24 text-white sm:py-32">
        <div className="gridlines-dark pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHead
            dark
            id="rules"
            clause="The rules the money follows"
            title={
              <>
                Six rules, <span className="text-lilac">no exceptions.</span>
              </>
            }
            body="These are enforced in code on the server, not by the app or the model. Each one has tests that run against a PayPal stand-in with the same rules."
          />
          <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] bg-white/10 md:grid-cols-2 lg:grid-cols-3">
            {RULES.map(([k, v], i) => (
              <Reveal key={k} delay={(i % 3) * 90} className="bg-night-2 p-7">
                <div className="font-mono text-[12px] text-lilac">Rule {String(i + 1).padStart(2, "0")}</div>
                <div className="mt-3 text-[19px] font-semibold tracking-tight">{k}</div>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/60">{v}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="mx-auto mt-20 max-w-md">
            <Receipt />
          </Reveal>
        </div>
      </section>

      <section className="py-24 sm:py-32">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead clause="Questions" title={<>The fine print, <span className="text-violet">plainly.</span></>} />
          <Reveal delay={100}>
            <Faq items={FAQ} />
          </Reveal>
        </div>
      </section>

      <Cta title={<>Try it with <span className="text-lilac">nothing at stake.</span></>} body="The demo runs a whole job in your browser. Play both sides and watch the hold turn into payments." secondary={{ href: "/security", label: "Security" }} />
    </>
  );
}
