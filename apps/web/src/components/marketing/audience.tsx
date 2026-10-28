// One template for the two audience pages.

import Link from "next/link";
import { Bullet, Cta, Faq, PageHero, SectionHead } from "@/components/marketing/blocks";
import { Reveal } from "@/components/ui/reveal";

export interface AudienceProps {
  clause: string;
  title: React.ReactNode;
  lede: string;
  promises: { k: string; v: string }[];
  journeyTitle: React.ReactNode;
  journey: { when: string; what: string; money: string }[];
  feature: { clause: string; title: React.ReactNode; body: string; points: string[]; visual: React.ReactNode };
  faq: [string, string][];
  cta: { title: React.ReactNode; body: string };
}

export function AudiencePage(p: AudienceProps) {
  return (
    <>
      <PageHero clause={p.clause} title={p.title} lede={p.lede}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/demo" className="press btn-primary inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-medium">
            Try the demo
          </Link>
          <Link href="/sign-in" className="press inline-flex h-12 items-center justify-center rounded-full border border-line-2 bg-card px-7 text-[15px] font-medium">
            Sign in
          </Link>
        </div>
      </PageHero>

      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-px overflow-hidden rounded-[28px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {p.promises.map((x, i) => (
            <Reveal key={x.k} delay={i * 80} className="bg-card p-7">
              <div className="clause">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-3 text-[18px] font-semibold tracking-tight">{x.k}</div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{x.v}</p>
            </Reveal>
          ))}
        </div>
        </div>
      </section>

      <section className="grain relative overflow-hidden bg-night py-24 text-white sm:py-32">
        <div className="gridlines-dark pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <SectionHead dark clause="The journey" title={p.journeyTitle} />
          <ol className="mt-14">
            {p.journey.map((j, i) => (
              <Reveal as="li" key={j.when} delay={i * 70} className="grid gap-2 border-t border-white/10 py-6 sm:grid-cols-[200px_1fr_160px] sm:items-baseline sm:gap-8">
                <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-lilac">{j.when}</div>
                <div className="text-[17px] leading-relaxed text-white/85">{j.what}</div>
                <div className="num text-[15px] text-white/60 sm:text-right">{j.money}</div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-24 sm:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <SectionHead clause={p.feature.clause} title={p.feature.title} body={p.feature.body} />
            <Reveal delay={100}>
              <ul className="mt-8 space-y-4">
                {p.feature.points.map((x) => (
                  <Bullet key={x}>{x}</Bullet>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={150}>{p.feature.visual}</Reveal>
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead clause="Questions" title={<>Asked <span className="italic text-violet">often.</span></>} />
          <Reveal delay={100}>
            <Faq items={p.faq} />
          </Reveal>
        </div>
      </section>

      <Cta title={p.cta.title} body={p.cta.body} />
    </>
  );
}
