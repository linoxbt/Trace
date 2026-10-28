import Link from "next/link";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { Story } from "@/components/marketing/story";
import { Receipt } from "@/components/marketing/receipt";
import { Inspection } from "@/components/marketing/inspection";
import { Corners, Cta, Marquee, SectionHead } from "@/components/marketing/blocks";
import { IconArrow } from "@/components/marketing/icons";
import { Reveal } from "@/components/ui/reveal";

export default function Home() {
  return (
    <>
      <Hero />
      <Marquee
        items={[
          "Held by PayPal, not by Trace",
          "Nothing charged until verified",
          "150 m geofence on every photo",
          "One-time camera token",
          "Partial capture as lines pass",
          "Final capture releases the rest",
          "Disputes answered with evidence",
        ]}
      />
      <Anatomy />
      <Statement />
      <Report />
      <Sides />
      <Cta
        title={
          <>
            See the money <span className="italic text-lilac">move.</span>
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
    <section className="relative overflow-hidden pt-28 sm:pt-36">
      <div className="gridlines pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-5 text-center sm:px-8">
        <p className="clause rise uppercase">Home repairs, paid on proof</p>
        <h1 className="display rise mx-auto mt-6 max-w-5xl text-[64px] leading-[0.9] tracking-[-0.025em] sm:text-[104px] lg:text-[128px]" style={{ "--delay": "60ms" } as React.CSSProperties}>
          Pay for <span className="italic text-violet">proof,</span>
          <br />
          not promises.
        </h1>
        <p className="rise mx-auto mt-8 max-w-xl text-[18px] leading-relaxed text-muted sm:text-[20px]" style={{ "--delay": "140ms" } as React.CSSProperties}>
          Trace holds a homeowner&apos;s payment with PayPal and releases it line by line, only when AI confirms the work from photos taken on site.
        </p>
        <div className="rise mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ "--delay": "220ms" } as React.CSSProperties}>
          <Link href="/demo" className="press btn-primary inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-medium">
            Try the live demo <IconArrow />
          </Link>
          <Link href="/how-it-works" className="press inline-flex h-12 items-center rounded-full border border-line-2 bg-card px-7 text-[15px] font-medium hover:border-ink/30">
            How it works
          </Link>
        </div>
      </div>

      {/* The stage: the product, live. */}
      <div className="rise mx-auto mt-16 max-w-[1400px] px-3 sm:mt-20 sm:px-5" style={{ "--delay": "260ms" } as React.CSSProperties}>
        <div className="stage grain relative overflow-hidden rounded-[40px] px-4 pb-16 pt-14 sm:px-8 sm:pt-16">
          <Corners />
          <div className="relative mb-10 flex items-center justify-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-lilac" />
            Live · bathroom repair · 4 lines · $420.00 held
          </div>
          <HeroDemo />
        </div>
      </div>

      {/* The three numbers the whole product is about. */}
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <dl className="grid grid-cols-1 divide-y divide-line border-b border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ["$0.00", "charged before the work is proved"],
            ["$310.00", "released the moment three lines passed"],
            ["$110.00", "held back for one cracked joint"],
          ].map(([k, v], i) => (
            <Reveal key={v} delay={i * 100} className="px-2 py-8 sm:px-8 sm:py-10">
              <dt className="num text-[36px] font-semibold tracking-tight sm:text-[44px]">{k}</dt>
              <dd className="mt-1 text-[15px] text-muted">{v}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- anatomy */

function Anatomy() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          clause="§ 1 — The anatomy of a release"
          title={
            <>
              A contract a camera <span className="italic text-violet">can check.</span>
            </>
          }
          body="Four steps from a dripping tap to a paid invoice. The homeowner and the tradesperson share one job link, and PayPal holds the money the whole way."
        />
        <div className="mt-8">
          <Story />
        </div>
        <Reveal className="mt-6">
          <Link href="/how-it-works" className="inline-flex items-center gap-2 text-[15px] font-medium text-violet hover:underline">
            Read the full walkthrough <IconArrow />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- statement */

function Statement() {
  return (
    <section className="grain relative overflow-hidden bg-night py-24 text-white sm:py-32">
      <div className="gridlines-dark pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute right-[-10%] top-[10%] h-[600px] w-[700px] rounded-full bg-[radial-gradient(closest-side,rgba(91,47,214,0.45),transparent)] blur-2xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-[1fr_440px]">
        <div>
          <SectionHead
            dark
            clause="§ 2 — The money"
            title={
              <>
                Every dollar <span className="italic text-lilac">has a reason.</span>
              </>
            }
            body="One authorization per job, captured in pieces as lines pass. The AI never decides an amount: it reports what it sees, and code works out the release from approved lines, checked against the hold before every capture."
          />
          <Reveal delay={120}>
            <ul className="mt-10 grid max-w-xl gap-x-8 gap-y-5 sm:grid-cols-2">
              {[
                ["Recorded before it's sent", "Each capture carries a PayPal-Request-Id, so a lost response never charges twice."],
                ["Never more than the hold", "Releases are capped at what was authorized, line by line."],
                ["Final capture, then nothing", "The last release tells PayPal to free whatever is left."],
                ["Renewed if the job runs long", "After the 3-day honour period, Trace asks PayPal to renew the hold once."],
              ].map(([k, v]) => (
                <li key={k} className="border-t border-white/10 pt-4">
                  <div className="text-[15px] font-medium">{k}</div>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/55">{v}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
        <Reveal delay={150}>
          <Receipt className="rotate-1" />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- report */

function Report() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-start gap-16 px-5 sm:px-8 lg:grid-cols-[1fr_520px]">
        <div className="lg:sticky lg:top-28">
          <SectionHead
            clause="§ 3 — Proof"
            title={
              <>
                Here, now, for this line. <span className="italic text-violet">Or it doesn&apos;t count.</span>
              </>
            }
            body="Every after-photo gets an inspection report. Location, freshness and reuse are checked on the server before a model ever looks, and when the AI isn't sure, it says so and the homeowner decides."
          />
          <Reveal delay={100}>
            <Link href="/security" className="mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-violet hover:underline">
              Every check, and the money rules <IconArrow />
            </Link>
          </Reveal>
        </div>
        <Reveal delay={120}>
          <Inspection />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- sides */

function Sides() {
  const halves = [
    {
      href: "/homeowners",
      party: "The homeowner",
      title: "Pay for the repair you can see.",
      body: "Approve a scope in plain words. PayPal holds the money; each line is paid only after its photos pass, and anything unfinished comes back.",
      dark: false,
    },
    {
      href: "/tradespeople",
      party: "The tradesperson",
      title: "Get paid as you finish.",
      body: "Know the money is there before you buy materials. Every line you prove is released, and your photo log doubles as a dispute defence.",
      dark: true,
    },
  ];
  return (
    <section className="pb-24 sm:pb-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          clause="§ 4 — The parties"
          title={
            <>
              Two sides, <span className="italic text-violet">one link.</span>
            </>
          }
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {halves.map((h, i) => (
            <Reveal key={h.href} delay={i * 120}>
              <Link
                href={h.href}
                className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-[32px] p-8 transition-transform duration-500 hover:-translate-y-1 sm:p-10 ${
                  h.dark ? "stage grain text-white" : "surface"
                }`}
              >
                <div>
                  <div className={`clause uppercase ${h.dark ? "!text-lilac" : ""}`}>{h.party}</div>
                  <h3 className="display mt-4 text-[40px] leading-[1] sm:text-[52px]">{h.title}</h3>
                  <p className={`mt-5 max-w-md leading-relaxed ${h.dark ? "text-white/70" : "text-muted"}`}>{h.body}</p>
                </div>
                <div className="mt-12 flex items-end justify-between gap-6">
                  <div className="flex-1">
                    <div className={`h-px ${h.dark ? "bg-white/30" : "bg-line-2"}`} />
                    <div className={`mt-2 font-mono text-[11px] uppercase tracking-[0.12em] ${h.dark ? "text-white/50" : "text-faint"}`}>Signed · {h.party.replace("The ", "")}</div>
                  </div>
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition-transform duration-500 group-hover:translate-x-1 ${
                      h.dark ? "bg-white text-ink" : "bg-violet text-white"
                    }`}
                  >
                    <IconArrow />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
