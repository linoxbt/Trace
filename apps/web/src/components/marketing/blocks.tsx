// Building blocks shared by the marketing pages.

import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { IconArrow } from "./icons";

export function PageHero({ clause, title, lede, children }: { clause: string; title: React.ReactNode; lede: string; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden pb-16 pt-32 sm:pb-20 sm:pt-40">
      <div className="gridlines pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="clause rise">{clause}</p>
        <h1 className="display rise mt-5 max-w-4xl text-[52px] leading-[0.95] tracking-[-0.02em] sm:text-[84px]" style={{ "--delay": "60ms" } as React.CSSProperties}>
          {title}
        </h1>
        <p className="rise mt-7 max-w-2xl text-[18px] leading-relaxed text-muted sm:text-[20px]" style={{ "--delay": "140ms" } as React.CSSProperties}>
          {lede}
        </p>
        {children && (
          <div className="rise mt-9" style={{ "--delay": "220ms" } as React.CSSProperties}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

export function SectionHead({ clause, title, body, dark = false, id }: { clause: string; title: React.ReactNode; body?: string; dark?: boolean; id?: string }) {
  return (
    <Reveal className="max-w-3xl">
      <p id={id} className={`clause scroll-mt-24 ${dark ? "!text-lilac" : ""}`}>
        {clause}
      </p>
      <h2 className="display mt-4 text-[42px] leading-[0.98] tracking-[-0.015em] sm:text-[64px]">{title}</h2>
      {body && <p className={`mt-6 max-w-2xl text-[17px] leading-relaxed ${dark ? "text-white/65" : "text-muted"}`}>{body}</p>}
    </Reveal>
  );
}

export function Cta({ title, body, primary = { href: "/demo", label: "Try the demo" }, secondary = { href: "/how-it-works", label: "How it works" } }: {
  title: React.ReactNode;
  body: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="px-3 pb-3 pt-10 sm:px-5 sm:pb-5">
      <div className="stage grain relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] px-6 py-24 text-center text-white sm:py-32">
        <Corners />
        <Reveal className="relative">
          <h2 className="display mx-auto max-w-3xl text-[46px] leading-[0.98] sm:text-[80px]">{title}</h2>
          <p className="mx-auto mt-6 max-w-xl text-[17px] text-white/70">{body}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={primary.href} className="press inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-ink hover:bg-violet-soft">
              {primary.label} <IconArrow />
            </Link>
            <Link href={secondary.href} className="press inline-flex h-12 items-center rounded-full border border-white/25 px-6 text-[15px] font-medium hover:bg-white/10">
              {secondary.label}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** The logo's viewfinder corners, framing a stage. */
export function Corners({ inset = 22, color = "rgba(255,255,255,0.45)" }: { inset?: number; color?: string }) {
  const s = { position: "absolute" as const, width: 26, height: 26, borderColor: color };
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span style={{ ...s, top: inset, left: inset, borderTop: "1.5px solid", borderLeft: "1.5px solid" }} />
      <span style={{ ...s, top: inset, right: inset, borderTop: "1.5px solid", borderRight: "1.5px solid" }} />
      <span style={{ ...s, bottom: inset, left: inset, borderBottom: "1.5px solid", borderLeft: "1.5px solid" }} />
      <span style={{ ...s, bottom: inset, right: inset, borderBottom: "1.5px solid", borderRight: "1.5px solid" }} />
    </div>
  );
}

export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="marquee relative overflow-hidden border-y border-line bg-card/60 py-4" aria-label={items.join(". ")}>
      <div className="marquee-track flex w-max animate-marquee gap-10 whitespace-nowrap" aria-hidden>
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-10 font-mono text-[12.5px] uppercase tracking-[0.12em] text-ink-2">
            {t}
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-violet">
              <path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z" fill="currentColor" />
            </svg>
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-paper to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-paper to-transparent" />
    </div>
  );
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map(([q, a]) => (
        <details key={q} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[18px] font-medium tracking-tight [&::-webkit-details-marker]:hidden">
            {q}
            <span className="relative h-4 w-4 shrink-0 text-violet transition-transform duration-500 group-open:rotate-45" aria-hidden>
              <span className="absolute left-0 top-1/2 h-[1.5px] w-4 -translate-y-1/2 bg-current" />
              <span className="absolute left-1/2 top-0 h-4 w-[1.5px] -translate-x-1/2 bg-current" />
            </span>
          </summary>
          <p className="max-w-2xl pb-6 leading-relaxed text-muted">{a}</p>
        </details>
      ))}
    </div>
  );
}

export function Bullet({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-[3px] grid h-5 w-5 shrink-0 place-items-center rounded-full ${dark ? "bg-lilac text-ink" : "bg-violet text-white"}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m5 12.5 4.2 4L19 7" />
        </svg>
      </span>
      <span className={dark ? "text-white/80" : "text-ink-2"}>{children}</span>
    </li>
  );
}
