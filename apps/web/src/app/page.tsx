import Link from "next/link";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/marketing/nav";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { Reveal } from "@/components/ui/reveal";
import { TileArt } from "@/components/ui/tile-art";
import {
  IconArrow,
  IconCamera,
  IconCheck,
  IconClock,
  IconDoc,
  IconFingerprint,
  IconLayers,
  IconLock,
  IconMic,
  IconPin,
  IconScreen,
  IconShield,
} from "@/components/marketing/icons";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <How />
        <Ledger />
        <Proof />
        <Sides />
        <Disputes />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

/* ---------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-28 sm:pt-32 lg:pb-28">
      <div className="gridlines pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute left-1/2 top-[-280px] -z-10 h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(158,240,216,0.55),transparent)] blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 sm:px-8 xl:grid-cols-[1.05fr_1fr] xl:gap-8">
        <div>
          <div className="rise inline-flex items-center gap-2 rounded-full border border-line bg-card/70 py-1 pl-1 pr-3 text-[12.5px] text-ink-2 backdrop-blur">
            <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">New</span>
            Payments held by PayPal, released by proof
          </div>
          <h1 className="rise mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[64px] lg:text-[72px]" style={{ "--delay": "80ms" } as React.CSSProperties}>
            Pay for proof,
            <br />
            <span className="display text-[1.08em] italic tracking-[-0.02em] text-teal">not promises.</span>
          </h1>
          <p className="rise mt-6 max-w-[29rem] text-[17px] leading-relaxed text-muted sm:text-[19px]" style={{ "--delay": "160ms" } as React.CSSProperties}>
            Trace holds a homeowner&apos;s payment with PayPal and releases it line by line, only when AI confirms the work from photos taken on site.
          </p>
          <div className="rise mt-9 flex flex-col gap-3 sm:flex-row" style={{ "--delay": "240ms" } as React.CSSProperties}>
            <Link href="/jobs/new" className="press btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium">
              Start a job <IconArrow />
            </Link>
            <a href="#how" className="press inline-flex h-12 items-center justify-center rounded-full border border-line bg-card px-6 text-[15px] font-medium hover:border-line-2">
              See how it works
            </a>
          </div>
          <ul className="rise mt-10 grid max-w-lg gap-3 text-[14px] text-ink-2 sm:grid-cols-3 sm:gap-4" style={{ "--delay": "320ms" } as React.CSSProperties}>
            {["Nothing charged until verified", "Every line checked from photos", "Trace never holds the money"].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-teal text-white">
                  <IconCheck />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rise" style={{ "--delay": "200ms" } as React.CSSProperties}>
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- problem */

function Problem() {
  return (
    <section className="grain relative overflow-hidden bg-night py-24 text-white sm:py-32">
      <div className="gridlines-dark pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-mint">The deposit standoff</p>
          <h2 className="mt-5 max-w-3xl text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
            Small repairs run on trust <span className="display italic text-white/70">nobody has.</span>
          </h2>
        </Reveal>
        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2">
          {[
            { who: "The homeowner", line: "Pays up front and hopes.", body: "Money leaves before a single tile is touched. If the job is half done, getting it back is a fight." },
            { who: "The tradesperson", line: "Does the work and hopes.", body: "Days of labour and materials, then an invoice that gets disputed, delayed or ignored." },
          ].map((c, i) => (
            <Reveal key={c.who} delay={i * 120} className="bg-night-2 p-8 sm:p-10">
              <div className="text-[13px] text-white/50">{c.who}</div>
              <div className="mt-3 text-[26px] font-semibold tracking-tight sm:text-[30px]">{c.line}</div>
              <p className="mt-4 max-w-sm leading-relaxed text-white/60">{c.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-14 text-[22px] tracking-tight text-white/80 sm:text-[28px]">
            Trace replaces hope with a <span className="display italic text-mint">hold</span>, and the hold with proof.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- how it works */

function SectionHead({ eyebrow, title, body, id }: { eyebrow: string; title: React.ReactNode; body?: string; id?: string }) {
  return (
    <Reveal className="max-w-3xl">
      <p id={id} className="scroll-mt-24 text-[13px] font-medium uppercase tracking-[0.18em] text-teal">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[52px]">{title}</h2>
      {body && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted">{body}</p>}
    </Reveal>
  );
}

function How() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          id="how"
          eyebrow="How it works"
          title={
            <>
              A contract a camera <span className="display italic text-teal">can check.</span>
            </>
          }
          body="Four steps from a dripping tap to a paid invoice. The homeowner and the tradesperson share one job link; PayPal holds the money the whole way."
        />
        <div className="mt-16 grid gap-5 md:grid-cols-2">
          <Step n="01" title="Scope it" body="Photograph the problem and describe it out loud. AI drafts priced lines, each with a check a camera can make. The tradesperson edits the prices." delay={0}>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-teal-soft text-teal"><IconMic /></span>
                &ldquo;The grout&apos;s cracked by the shower and the tap won&apos;t stop dripping…&rdquo;
              </div>
              <MiniLine code="L4" title="Regrout shower wall" price="110.00" criterion="Continuous grout in every joint; no visible cracks" />
              <MiniLine code="L1" title="Fix dripping tap" price="120.00" criterion="Tap closed with a dry spout" faded />
            </div>
          </Step>
          <Step n="02" title="Hold it" body="The homeowner approves the scope inside PayPal. The total is authorized, not charged. Nothing moves until work is proved." delay={100}>
            <div className="surface rounded-2xl p-4">
              <div className="text-[12px] text-muted">Approve and hold</div>
              <div className="num mt-1 text-[30px] font-semibold tracking-tight">$420.00</div>
              <div className="mt-3 flex h-11 items-center justify-center rounded-xl bg-[#ffc439] text-[14px] font-semibold text-[#003087]">
                Pay<span className="text-[#009cde]">Pal</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[12px] text-ok">
                <IconLock /> Held for up to 29 days · nothing charged
              </div>
            </div>
          </Step>
          <Step n="03" title="Prove it" body="For each line, the tradesperson shoots an after-photo in the app, lined up with a ghost of the before-photo. AI judges it against what was agreed." delay={0}>
            <div className="grid grid-cols-2 gap-2">
              <figure className="bracket overflow-hidden rounded-xl" style={{ "--bracket": "#b42318" } as React.CSSProperties}>
                <TileArt state="before" highlight className="block aspect-[4/3] w-full" />
                <figcaption className="bg-card px-2.5 py-1.5 text-[11px] text-muted">Before</figcaption>
              </figure>
              <figure className="bracket overflow-hidden rounded-xl">
                <TileArt state="after" className="block aspect-[4/3] w-full" />
                <figcaption className="flex items-center justify-between bg-card px-2.5 py-1.5 text-[11px]">
                  <span className="text-muted">After</span>
                  <span className="font-medium text-ok">Verified</span>
                </figcaption>
              </figure>
            </div>
          </Step>
          <Step n="04" title="Release it" body="PayPal captures exactly the verified lines. Unfinished work stays held until it's fixed, or both sides agree to drop it and the rest is released." delay={100}>
            <div className="surface rounded-2xl p-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[12px] text-muted">Released</div>
                  <div className="num text-[26px] font-semibold tracking-tight text-teal">$310.00</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] text-muted">Still held</div>
                  <div className="num text-[18px] font-semibold">$110.00</div>
                </div>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full w-[74%] rounded-full bg-gradient-to-r from-teal to-[#19b39f]" />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-faint">
                <span>3 lines paid</span>
                <span>1 waiting on a fix</span>
              </div>
            </div>
          </Step>
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, body, children, delay }: { n: string; title: string; body: string; children: React.ReactNode; delay: number }) {
  return (
    <Reveal delay={delay} className="surface group flex flex-col justify-between gap-8 rounded-[28px] p-6 transition-transform duration-500 hover:-translate-y-1 sm:p-8">
      <div>
        <div className="num text-[13px] text-faint">{n}</div>
        <h3 className="mt-2 text-[24px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-md leading-relaxed text-muted">{body}</p>
      </div>
      <div className="rounded-2xl bg-paper p-4">{children}</div>
    </Reveal>
  );
}

function MiniLine({ code, title, price, criterion, faded }: { code: string; title: string; price: string; criterion: string; faded?: boolean }) {
  return (
    <div className={`surface rounded-xl p-3 ${faded ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between text-[13px] font-medium">
        <span>
          <span className="num mr-1.5 text-[11px] text-faint">{code}</span>
          {title}
        </span>
        <span className="num">${price}</span>
      </div>
      <div className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-muted">
        <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
        {criterion}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- ledger */

const LEDGER = [
  { api: "Orders v2 · intent AUTHORIZE", what: "Homeowner approves the scope", amount: "$420.00", tag: "Held", tone: "text-white" },
  { api: "Payments v2 · capture · final_capture: false", what: "Tap, sealant and towel rail verified", amount: "$310.00", tag: "Captured", tone: "text-mint" },
  { api: "Verdict · L4 failed", what: "Grout still cracked above the soap dish", amount: "$110.00", tag: "Still held", tone: "text-[#ffb4ab]" },
  { api: "Payments v2 · capture · final_capture: true", what: "Grout redone, re-proved, verified", amount: "$110.00", tag: "Captured", tone: "text-mint" },
];

function Ledger() {
  return (
    <section className="grain relative overflow-hidden bg-night py-24 text-white sm:py-32">
      <div className="pointer-events-none absolute right-[-200px] top-[-120px] h-[500px] w-[700px] rounded-full bg-[radial-gradient(closest-side,rgba(13,138,123,0.35),transparent)] blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl gap-16 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <p id="ledger" className="scroll-mt-24 text-[13px] font-medium uppercase tracking-[0.18em] text-mint">
            The money
          </p>
          <h2 className="mt-4 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[52px]">
            Every dollar has <span className="display italic text-mint">a reason.</span>
          </h2>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/65">
            One authorization per job, captured in pieces as lines are verified. The model never decides an amount: it reports what it sees, and code
            works out the release from verified lines and checks it against the hold before every capture.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-2 gap-6">
            {[
              ["0", "times Trace holds the money"],
              ["1", "authorization per job"],
              ["29", "days PayPal can hold it"],
              ["0", "amounts decided by the AI"],
            ].map(([k, v]) => (
              <div key={v} className="border-t border-white/10 pt-4">
                <dt className="num text-[30px] font-semibold tracking-tight">{k}</dt>
                <dd className="mt-1 text-[13px] text-white/55">{v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
        <div className="relative">
          <div className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-white/30 via-white/15 to-transparent" />
          <ol className="space-y-4">
            {LEDGER.map((row, i) => (
              <Reveal as="li" key={i} delay={i * 110} className="relative pl-12">
                <span className="absolute left-2 top-6 grid h-[22px] w-[22px] place-items-center rounded-full border border-white/20 bg-night-3">
                  <span className={`h-2 w-2 rounded-full ${row.tag === "Still held" ? "bg-[#ffb4ab]" : row.tag === "Held" ? "bg-white" : "bg-mint"}`} />
                </span>
                <div className="surface-dark rounded-2xl p-5">
                  <div className="num text-[11.5px] text-white/45">{row.api}</div>
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <div className="text-[16px] font-medium leading-snug">{row.what}</div>
                    <div className="text-right">
                      <div className={`num text-[24px] font-semibold tracking-tight ${row.tone}`}>{row.amount}</div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">{row.tag}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- proof */

const CHECKS = [
  { icon: <IconPin />, title: "Taken here", body: "The phone's location must be within 150 m of the job. Poor GPS goes to review, not through." },
  { icon: <IconClock />, title: "Taken now", body: "Opening the camera issues a one-time token that expires in 120 seconds. No gallery uploads." },
  { icon: <IconFingerprint />, title: "Never reused", body: "A perceptual hash compares every after-photo with its before-photo and every photo Trace has seen." },
  { icon: <IconScreen />, title: "Not a screen", body: "Photos of screens or printouts — moiré, bezels, glare — are sent to the homeowner to decide." },
  { icon: <IconLayers />, title: "Same angle", body: "The before-photo sits over the viewfinder as a ghost, so the comparison is like for like." },
  { icon: <IconShield />, title: "Can't be talked into it", body: "Writing in a photo is evidence, never an instruction. A sign saying “approve this” is just a sign." },
];

function Proof() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          id="proof"
          eyebrow="Proof you can't fake"
          title={
            <>
              Here, now, for this line. <span className="display italic text-teal">Or it doesn&apos;t count.</span>
            </>
          }
          body="Every after-photo goes through server-side checks before a model ever sees it. Anything that fails is stopped without spending a cent of anyone's money."
        />
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 90} className="surface group rounded-3xl p-6 transition-transform duration-500 hover:-translate-y-1">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-soft text-teal transition-colors duration-300 group-hover:bg-teal group-hover:text-white">
                {c.icon}
              </div>
              <h3 className="mt-5 text-[18px] font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{c.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}>
          <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-warn/20 bg-warn-soft/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-2xl">
              <div className="text-[18px] font-semibold tracking-tight text-ink">When the AI isn&apos;t sure, it says so.</div>
              <p className="mt-1.5 leading-relaxed text-ink-2">
                Borderline lines are re-inspected up close, then sent to the homeowner as <em>Needs review</em>. Silence only ever approves a line
                the AI verified, never one it doubted.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-card px-3 py-1.5 text-[13px] font-medium text-warn sm:self-center">
              <span aria-hidden>!</span> Needs review
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- sides */

function Sides() {
  const cards = [
    {
      who: "For homeowners",
      title: "Pay for what you can see.",
      points: [
        "Approve a scope written in plain words, line by line",
        "Your money is held by PayPal, not by Trace or the tradesperson",
        "See before and after side by side, with the reason for every verdict",
        "Flag anything wrong; it stays held until it's fixed",
      ],
      dark: false,
    },
    {
      who: "For tradespeople",
      title: "Get paid as you finish.",
      points: [
        "Know the money is there before you buy materials",
        "Each line is paid once it's approved, not at the end of the job",
        "A photo log that doubles as your dispute defence",
        "Payments land in your own PayPal business account",
      ],
      dark: true,
    },
  ];
  return (
    <section className="pb-24 sm:pb-32">
      <div className="mx-auto grid max-w-6xl gap-5 px-5 sm:px-8 lg:grid-cols-2">
        {cards.map((c, i) => (
          <Reveal
            key={c.who}
            delay={i * 120}
            className={`relative overflow-hidden rounded-[32px] p-8 sm:p-10 ${c.dark ? "grain bg-night text-white" : "surface"}`}
          >
            <div className={`text-[13px] font-medium uppercase tracking-[0.16em] ${c.dark ? "text-mint" : "text-teal"}`}>{c.who}</div>
            <h3 className="mt-4 text-[30px] font-semibold leading-tight tracking-[-0.025em] sm:text-[38px]">{c.title}</h3>
            <ul className="mt-8 space-y-4">
              {c.points.map((p) => (
                <li key={p} className="flex gap-3">
                  <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full ${c.dark ? "bg-mint text-ink" : "bg-teal text-white"}`}>
                    <IconCheck />
                  </span>
                  <span className={c.dark ? "text-white/80" : "text-ink-2"}>{p}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- disputes */

function Disputes() {
  const items = [
    ["Signed scope", "Every line, price and acceptance criterion both sides approved"],
    ["Before and after photos", "With capture time and distance from the job"],
    ["Integrity report", "Token, location, hash and recapture checks for each photo"],
    ["Verdicts and approvals", "What the AI saw, and when the homeowner released each line"],
  ];
  return (
    <section className="relative overflow-hidden bg-paper-2 py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-2">
        <div>
          <SectionHead
            eyebrow="Disputes"
            title={
              <>
                The defence <span className="display italic text-teal">writes itself.</span>
              </>
            }
          />
          <Reveal delay={100}>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted">
              If a homeowner disputes a payment with PayPal, Trace drafts the response from the same photo log that got the work paid, and the
              tradesperson files it in one tap.
            </p>
            <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-faint">
              PayPal&apos;s seller protection is aimed at goods, so no service dispute is guaranteed. Trace gives you the strongest case you can make.
            </p>
          </Reveal>
        </div>
        <Reveal delay={150} className="relative">
          <div className="absolute -right-4 -top-4 h-full w-full rotate-[2.5deg] rounded-[28px] bg-card/70 shadow-sm" />
          <div className="surface relative rounded-[28px] p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white">
                  <IconDoc />
                </span>
                <div>
                  <div className="text-[15px] font-semibold">Evidence pack</div>
                  <div className="num text-[12px] text-faint">PROOF_OF_FULFILLMENT · PDF</div>
                </div>
              </div>
              <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[12px] font-medium text-ok">Ready to file</span>
            </div>
            <ul className="mt-6 divide-y divide-line">
              {items.map(([k, v]) => (
                <li key={k} className="flex items-start gap-3 py-3.5">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal text-white">
                    <IconCheck />
                  </span>
                  <div>
                    <div className="text-[14.5px] font-medium">{k}</div>
                    <div className="text-[13px] text-muted">{v}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <TileArt state="before" className="aspect-[4/3] w-full rounded-lg" />
              <TileArt state="after" className="aspect-[4/3] w-full rounded-lg" />
              <div className="grid aspect-[4/3] place-items-center rounded-lg bg-paper text-center text-[11px] leading-tight text-muted">
                <span>
                  <span className="num block text-[15px] font-semibold text-ink">12 m</span>from the job
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ faq */

const FAQS = [
  ["Is my money taken when I approve?", "No. PayPal authorizes the total and holds it on your account. Money is only captured, line by line, after the work is verified and you've had the chance to review it."],
  ["Who actually holds the money?", "PayPal does. Captures settle straight into the tradesperson's own PayPal business account. Trace never takes custody of funds."],
  ["What if the AI gets it wrong?", "It never moves money on its own. A line it isn't sure about goes to you as Needs review and is only paid if you approve it. You can flag any verified line within the review window, and it stays held until it's fixed."],
  ["What about work you can't photograph, like pipes inside a wall?", "The scope marks those lines as not photo-verifiable and asks for a photo during the work instead. They go to you for review rather than being verified automatically."],
  ["What if the job is cancelled halfway?", "Both sides agree which lines to drop. Trace captures what was approved and PayPal releases the rest of the hold back to you."],
  ["Is this live?", "This is a sandbox demo built for the PayPal AI Hackathon. It runs on PayPal's sandbox, so no real money moves."],
];

function Faq() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHead id="faq" eyebrow="Questions" title={<>The fine print, <span className="display italic text-teal">in plain words.</span></>} />
        <Reveal delay={100} className="divide-y divide-line border-y border-line">
          {FAQS.map(([q, a]) => (
            <details key={q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-medium tracking-tight [&::-webkit-details-marker]:hidden">
                {q}
                <span className="relative h-4 w-4 shrink-0 text-muted transition-transform duration-500 group-open:rotate-45" aria-hidden>
                  <span className="absolute left-0 top-1/2 h-[1.5px] w-4 -translate-y-1/2 bg-current" />
                  <span className="absolute left-1/2 top-0 h-4 w-[1.5px] -translate-x-1/2 bg-current" />
                </span>
              </summary>
              <p className="max-w-2xl pb-6 leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ cta */

function Cta() {
  return (
    <section className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="grain relative mx-auto max-w-[1400px] overflow-hidden rounded-[36px] bg-night px-6 py-24 text-center text-white sm:py-32">
        <div className="gridlines-dark pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute left-1/2 top-full h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(13,138,123,0.5),transparent)] blur-2xl" />
        <Reveal className="relative">
          <h2 className="mx-auto max-w-3xl text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
            Money that moves <span className="display italic text-mint">when the work does.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[17px] text-white/65">
            Start a job, invite the homeowner by email, and let the photos do the talking.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/jobs/new" className="press inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-ink hover:bg-mint">
              Start a job <IconArrow />
            </Link>
            <Link href="/sign-in" className="press inline-flex h-12 items-center rounded-full border border-white/20 px-6 text-[15px] font-medium hover:bg-white/5">
              Sign in
            </Link>
          </div>
          <div className="mt-12 flex items-center justify-center gap-2 text-[13px] text-white/45">
            <IconCamera /> Works in the phone browser. Nothing to install.
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-[14px] text-muted">Payment that follows proof.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-[14px] text-muted">
          <a href="#how" className="hover:text-ink">How it works</a>
          <Link href="/sign-in" className="hover:text-ink">Sign in</Link>
          <a href="#proof" className="hover:text-ink">Proof checks</a>
          <Link href="/jobs/new" className="hover:text-ink">Start a job</Link>
          <a href="#faq" className="hover:text-ink">FAQ</a>
          <a href="https://github.com/linoxbt/Trace" className="hover:text-ink">Source on GitHub</a>
        </div>
      </div>
      <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-[12.5px] text-faint sm:flex-row sm:justify-between">
        <span>Sandbox demo. No real money moves. Built for the PayPal AI Hackathon 2026.</span>
        <span>MIT licensed</span>
      </div>
    </footer>
  );
}
