import Link from "next/link";
import { ParticleHero } from "@/components/marketing/particle-hero";
import { BigMarquee, Chip, Cta, Eyebrow, Faq, FloatDots, PillLink, SectionHead, WordReveal } from "@/components/marketing/blocks";
import { PartyTabs } from "@/components/home/party-tabs";
import { StepsStack } from "@/components/home/steps-stack";
import { JobsGallery } from "@/components/home/jobs-gallery";
import { RingsRow } from "@/components/home/rings-row";
import { GeofenceMap } from "@/components/home/geofence-map";
import { Reveal } from "@/components/ui/reveal";

export default function Home() {
  return (
    <>
      <Hero />
      <Statement />
      <Fit />
      <Steps />
      <Gallery />
      <Why />
      <Trades />
      <BigMarquee items={["Held by PayPal", "Proved on site", "Released line by line", "Paid on proof"]} className="my-8 sm:my-12" />
      <Here />
      <Rules />
      <Questions />
      <Cta
        title={
          <>
            Got a repair that <span className="text-lilac">needs paying fairly?</span>
          </>
        }
        body="Run a whole job in your browser: approve the hold, prove the work, release the money. No sign-up, nothing charged."
      />
    </>
  );
}

/* ---------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-32 sm:pt-36 lg:min-h-[100svh] lg:pb-10">
      <FloatDots count={28} />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:gap-4">
        <div>
          <div className="rise">
            <Eyebrow>Home repairs · paid on proof · PayPal</Eyebrow>
          </div>
          <h1 className="display rise mt-6 text-[56px] leading-[0.92] sm:text-[84px] lg:text-[72px] xl:text-[86px]" style={{ "--delay": "60ms" } as React.CSSProperties}>
            <span className="sm:whitespace-nowrap">
              Pay for <span className="text-violet">proof,</span>
            </span>
            <br />
            <span className="sm:whitespace-nowrap">not promises.</span>
          </h1>
          <p className="rise mt-7 max-w-[480px] text-[17px] leading-relaxed text-ink-2 sm:text-[18.5px]" style={{ "--delay": "140ms" } as React.CSSProperties}>
            Trace holds a homeowner&apos;s payment with PayPal and releases it line by line, only when AI confirms the work from photos taken on site.
          </p>
          <div className="rise mt-9 flex flex-wrap gap-3" style={{ "--delay": "220ms" } as React.CSSProperties}>
            <PillLink href="/demo" tone="ink">
              Try the demo
            </PillLink>
            <PillLink href="/how-it-works" tone="light">
              How it works
            </PillLink>
          </div>
          <div className="rise mt-7 flex flex-wrap gap-2" style={{ "--delay": "300ms" } as React.CSSProperties}>
            <Chip>Held by PayPal, not by Trace</Chip>
            <Chip dot="brass">Nothing charged until verified</Chip>
          </div>
        </div>
        <div className="rise relative" style={{ "--delay": "200ms" } as React.CSSProperties}>
          <ParticleHero />
        </div>
      </div>
      <div className="mx-auto mt-12 hidden max-w-6xl items-center gap-3 px-8 font-mono text-[10.5px] uppercase tracking-[0.2em] text-faint lg:flex">
        <span className="relative h-8 w-5 rounded-full border-[1.5px] border-faint">
          <span className="absolute left-1/2 top-1.5 h-1.5 w-[2px] -translate-x-1/2 rounded bg-faint" style={{ animation: "wheel 1.8s ease-in-out infinite" }} />
        </span>
        Scroll
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- statement */

function Statement() {
  return (
    <section className="relative py-28 sm:py-40">
      <div aria-hidden className="puck pointer-events-none absolute -left-40 top-16 h-[440px] w-[440px] rounded-full" />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>Why Trace</Eyebrow>
        </Reveal>
        <WordReveal
          className="display mt-8 max-w-5xl text-[36px] leading-[1.08] sm:text-[60px]"
          text="Still paying deposits on a handshake and a WhatsApp photo? Trace keeps the money [held by PayPal] and releases it [line by line,] only when photos taken on site prove the work is done."
        />
        <Reveal className="mt-12">
          <Link href="/how-it-works" className="group inline-flex items-center gap-2 border-b-2 border-ink pb-1 text-[15px] font-semibold">
            The whole walkthrough
            <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- fit */

function Fit() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          clause="Who it's for"
          title={
            <>
              See where you <span className="text-violet">fit.</span>
            </>
          }
          body="Two parties share one job link, and PayPal holds the money between them. Pick a side, or let it play."
        />
        <div className="mt-12">
          <PartyTabs />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- steps */

function Steps() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          aside
          clause="How it works"
          title={
            <>
              Four steps from drip <span className="text-violet">to paid.</span>
            </>
          }
          body="Every job runs the same way. The money is held before work starts and moves only when a line is proved."
        />
        <div className="mt-12">
          <StepsStack />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- gallery */

function Gallery() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          aside
          clause="Proof on record"
          title={
            <>
              Work that <span className="text-violet">paid itself.</span>
            </>
          }
          body="One bathroom, four priced lines, every one proved from the job. Hover a photo to see what it looked like before."
        />
        <div className="mt-14">
          <JobsGallery />
        </div>
        <Reveal className="mt-14 flex justify-center">
          <PillLink href="/demo" tone="light" cursor="Play">
            Run this job yourself
          </PillLink>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- why */

function Why() {
  return (
    <section className="px-3 py-10 sm:px-5">
      <div className="grain relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] bg-night px-5 py-24 text-white sm:px-8 sm:py-32">
        <FloatDots count={18} dark />
        <div className="mx-auto max-w-6xl">
          <SectionHead
            dark
            aside
            clause="Why it holds up"
            title={
              <>
                Held, proved, <span className="text-lilac">then paid.</span>
              </>
            }
            body="Trace never touches the money. It decides when PayPal should move it, from evidence both sides can see."
          />
          <div className="mt-20">
            <RingsRow
              items={[
                { title: "Held by PayPal", body: "One authorization per job. The homeowner's money waits at PayPal, not in an account Trace controls." },
                { title: "Proved from the site", body: "Photos come from the job's phone, inside 150 m, through a camera token that works once." },
                { title: "Paid line by line", body: "Each proved line is captured on its own. Unfinished work is never charged and the rest is released." },
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- trades */

const TRADES: [string, string, React.ReactNode][] = [
  ["Plumbing", "Taps, leaks, cisterns", <path key="p" d="M7 4v5a3 3 0 0 0 3 3h7M17 9v6M14 20s3-3 3-5" />],
  ["Tiling & grout", "Joints, cracks, regrouts", <path key="p" d="M4 4h16v16H4zM12 4v16M4 12h16" />],
  ["Sealant & baths", "Beads, gaps, mould", <path key="p" d="M3 14h18v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3ZM6 14V6a2 2 0 0 1 4 0" />],
  ["Fixtures", "Rails, shelves, mirrors", <path key="p" d="M4 9h16M6 9V6M18 9V6M7 9v9h10V9" />],
  ["Painting & patching", "Walls, ceilings, trim", <path key="p" d="M5 4h12v5H5zM11 9v3h-1v8M17 6h2v5h-8" />],
  ["Doors & windows", "Hinges, locks, seals", <path key="p" d="M6 3h12v18H6zM14 12h1" />],
];

function Trades() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          clause="Jobs that fit"
          title={
            <>
              Any repair a <span className="text-violet">photo can prove.</span>
            </>
          }
          body="Trace works best for work you can see when it's finished. Write each line's pass criterion in plain words; the camera does the rest."
        />
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TRADES.map(([t, sub, icon], i) => (
            <Reveal key={t} delay={(i % 3) * 80}>
              <div className="clay clay-hover flex items-center gap-4 rounded-[22px] p-4">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${i === 0 ? "bg-violet text-white" : "bg-paper text-ink-2"}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {icon}
                  </svg>
                </span>
                <span>
                  <span className="block text-[15.5px] font-semibold">{t}</span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${i % 2 ? "bg-brass" : "bg-violet"}`} />
                    {sub}
                  </span>
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- here */

function Here() {
  const checks = ["Within 150 m of the job", "One-time token, 120 s", "Same phone as the job", "Not the before-photo", "Never used before", "Not a screen or a print"];
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <SectionHead
            clause="Proof checks"
            title={
              <>
                Here, now, <span className="text-violet">for this line.</span>
              </>
            }
            body="Before any AI looks at a photo, the server checks where and when it was taken and that it hasn't been seen before. A photo from across town is turned away."
          />
          <Reveal delay={100} className="mt-8 flex flex-wrap gap-2">
            {checks.map((c, i) => (
              <Chip key={c} dot={i % 3 === 2 ? "brass" : "violet"}>
                {c}
              </Chip>
            ))}
          </Reveal>
          <Reveal delay={160} className="mt-9">
            <PillLink href="/security" tone="light">
              Every check
            </PillLink>
          </Reveal>
        </div>
        <Reveal delay={120}>
          <GeofenceMap />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- rules */

function Rules() {
  const rules: [string, string][] = [
    ["Recorded before it's sent", "Each capture is saved with its PayPal-Request-Id first, so a lost response can never charge twice."],
    ["Never more than the hold", "Captures are capped at what PayPal authorized, line by line."],
    ["Final capture, then nothing", "The last release tells PayPal to free whatever is left on the hold."],
    ["Renewed if the job runs long", "After the 3-day honour period, Trace asks PayPal to renew the hold once."],
  ];
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          aside
          clause="The money rules"
          title={
            <>
              Every dollar <span className="text-violet">has a reason.</span>
            </>
          }
          body="The AI never decides an amount. It reports what it sees; code works out the release from approved lines and checks it against the hold before every capture."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rules.map(([t, b], i) => (
            <Reveal key={t} delay={i * 90}>
              <div className="clay clay-hover h-full rounded-[24px] p-6">
                <span className="font-mono text-[11px] text-violet">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-6 text-[17px] font-semibold leading-snug">{t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- questions */

function Questions() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <SectionHead
            clause="Questions people ask"
            title={
              <>
                Straight answers <span className="text-violet">before you start.</span>
              </>
            }
            body="Still not sure? Run the demo: it plays both sides of a real job under the same rules."
          />
          <Reveal delay={100} className="mt-8 flex flex-wrap gap-3">
            <PillLink href="/demo" tone="violet">
              Try the demo
            </PillLink>
            <PillLink href="/security" tone="light">
              Security
            </PillLink>
          </Reveal>
        </div>
        <Reveal delay={120}>
          <Faq
            items={[
              ["Who holds the money?", "PayPal. Trace creates an order with intent AUTHORIZE, so the homeowner's payment is authorized and held at PayPal. Trace only tells PayPal when to capture part of it."],
              ["What if the AI gets it wrong?", "It only reports what it sees against the line's written criterion. Below 0.80 confidence, or when two looks disagree, the line goes to the homeowner to decide. The homeowner can also flag any verified line."],
              ["Can a tradesperson fake a photo?", "The camera needs a one-time token that works for 120 seconds, the photo must be taken within 150 m of the job, and it is compared against every stored photo so an old one can't be reused."],
              ["What happens to money for unfinished work?", "It's never captured. When the job is closed, the final capture releases whatever is left back to the homeowner."],
              ["What if a job runs past the hold period?", "PayPal honours an authorization for 3 days. If lines are still open after that, Trace asks PayPal to renew the hold once."],
            ]}
          />
        </Reveal>
      </div>
    </section>
  );
}
