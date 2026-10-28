import type { Metadata } from "next";
import { Cta, PageHero, SectionHead } from "@/components/marketing/blocks";
import { Inspection } from "@/components/marketing/inspection";
import { IconClock, IconFingerprint, IconLayers, IconLock, IconPin, IconScreen, IconShield, IconDoc } from "@/components/marketing/icons";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = { title: "Security", description: "Proof you can't fake, money nobody holds: how Trace checks every photo and protects every capture." };

const CHECKS = [
  { icon: <IconPin />, title: "Taken here", body: "The phone's location must be within 150 m of where the first before-photo was taken. GPS worse than 100 m goes to review, never straight through." },
  { icon: <IconClock />, title: "Taken now", body: "Opening the camera issues a one-time token. The photo must arrive with it within 120 seconds. The app has no gallery upload." },
  { icon: <IconFingerprint />, title: "Never reused", body: "A 64-bit perceptual hash of every after-photo is compared with its own before-photo and every photo Trace has stored." },
  { icon: <IconScreen />, title: "Not a screen", body: "The verifier is asked whether the image is a photo of a screen or a printout. Moiré, bezels or glare send the line to review." },
  { icon: <IconLayers />, title: "Same place", body: "The before-photo is overlaid on the viewfinder, and the verifier must agree both photos show the same place, or the line fails." },
  { icon: <IconShield />, title: "Instructions ignored", body: "Text inside a photo is treated as evidence, never as an instruction. A sign saying “approve this” is just a sign." },
];

const MONEY = [
  { title: "No custody", body: "Captures settle straight into the tradesperson's own PayPal business account. Trace never holds funds." },
  { title: "Amounts from the server", body: "The PayPal secret lives only on the server. No request from the app or the model carries an amount; every capture is recomputed from the database and checked against the hold." },
  { title: "Idempotent by design", body: "Every capture, void and reauthorization sends a stored PayPal-Request-Id. Webhooks are de-duplicated on PayPal's event ID." },
  { title: "Verified webhooks", body: "Each webhook is checked with PayPal against its original body before anything is processed. Unverified ones are rejected." },
  { title: "Parties only", body: "Postgres row-level security lets each job's two parties read it; only the server can write. Photos sit in a private bucket behind 10-minute signed links." },
  { title: "Kept only as long as needed", body: "Photos and integrity reports are kept for 180 days after a job closes, the window in which disputes can arise. Locations in evidence are rounded to about 11 m." },
];

export default function Security() {
  return (
    <>
      <PageHero
        clause="Security"
        title={
          <>
            Proof you can&apos;t fake. <span className="italic text-violet">Money nobody holds.</span>
          </>
        }
        lede="Trace sits between two people who don't know each other yet. So every photo is checked before it counts, and no amount is ever decided by the app, the model, or Trace itself."
      />

      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHead clause="§ 1 — Photo integrity" title={<>Six checks, <span className="italic text-violet">every photo.</span></>} body="Integrity checks run on the server as the photo arrives. A failure stops the line before a model is ever called, so it costs nobody anything." />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHECKS.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 90} className="surface group rounded-[24px] p-6 transition-transform duration-500 hover:-translate-y-1">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-soft text-violet transition-colors duration-300 group-hover:bg-violet group-hover:text-white">{c.icon}</div>
                <h3 className="mt-5 text-[18px] font-semibold tracking-tight">{c.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{c.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto grid max-w-6xl items-start gap-16 px-5 sm:px-8 lg:grid-cols-[1fr_520px]">
          <div className="lg:sticky lg:top-28">
            <SectionHead clause="§ 2 — The verdict" title={<>Observations in, <span className="italic text-violet">rules out.</span></>} body="The AI describes what it sees against each agreed check. Code turns that into a verdict: Verified only with every check satisfied, the same place, and confidence of at least 0.80. Borderline lines are re-inspected on a 2× crop, and if the two passes disagree, the homeowner decides." />
          </div>
          <Reveal delay={120}>
            <Inspection />
          </Reveal>
        </div>
      </section>

      <section className="grain relative overflow-hidden bg-night py-24 text-white sm:py-32">
        <div className="gridlines-dark pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHead dark clause="§ 3 — The money" title={<>Built so it <span className="italic text-lilac">can&apos;t go wrong quietly.</span></>} />
          <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] bg-white/10 md:grid-cols-2 lg:grid-cols-3">
            {MONEY.map((m, i) => (
              <Reveal key={m.title} delay={(i % 3) * 90} className="bg-night-2 p-7">
                <div className="text-lilac">{i === 0 ? <IconLock /> : i === 5 ? <IconDoc /> : <IconShield />}</div>
                <div className="mt-4 text-[18px] font-semibold tracking-tight">{m.title}</div>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/60">{m.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <SectionHead clause="§ 4 — Honest limits" title={<>What Trace <span className="italic text-violet">can&apos;t promise.</span></>} />
          <Reveal delay={100}>
            <ul className="mt-10 space-y-6 text-[17px] leading-relaxed text-ink-2">
              <li>PayPal&apos;s seller protection is aimed at goods. A dispute over a service isn&apos;t guaranteed to go the tradesperson&apos;s way; the evidence pack is the strongest case, not a sure win.</li>
              <li>A determined fraudster with a virtual camera could feed the app a prepared image. That&apos;s why location, timing and reuse are checked on the server, and why the homeowner can always flag a line.</li>
              <li>Work hidden inside a wall can&apos;t be verified from an after-photo. Those lines are marked as such and always go to the homeowner.</li>
              <li>This is a sandbox demo built for the PayPal AI Hackathon. No real money moves.</li>
            </ul>
          </Reveal>
        </div>
      </section>

      <Cta title={<>Check it <span className="italic text-lilac">yourself.</span></>} body="The demo shows every verdict's working, from the first failed grout photo to the final capture." />
    </>
  );
}
