"use client";

// Building blocks shared by the marketing pages.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { getLenis } from "@/components/motion/smooth-scroll";

export function Eyebrow({ children, dark = false, className = "" }: { children: React.ReactNode; dark?: boolean; className?: string }) {
  return <p className={`eyebrow ${dark ? "eyebrow-dark" : ""} ${className}`}>{children}</p>;
}

/** The arrow disc that sits at the end of every pill button. */
export function ArrowDisc({ tone = "violet", size = 28 }: { tone?: "violet" | "white" | "ink"; size?: number }) {
  const bg = tone === "violet" ? "bg-violet text-white" : tone === "white" ? "bg-white text-violet" : "bg-ink text-white";
  return (
    <span className={`pill-arrow grid shrink-0 place-items-center rounded-full ${bg}`} style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
    </span>
  );
}

type Pill = "ink" | "light" | "violet" | "white";
export function PillLink({ href, children, tone = "ink", className = "", cursor }: { href: string; children: React.ReactNode; tone?: Pill; className?: string; cursor?: string }) {
  const look = {
    ink: "btn-ink",
    light: "btn-light",
    violet: "btn-primary",
    white: "bg-white text-ink hover:bg-violet-soft",
  }[tone];
  const disc = tone === "violet" ? "white" : tone === "ink" ? "violet" : "violet";
  return (
    <Link href={href} data-cursor={cursor} className={`pill press inline-flex h-[52px] items-center gap-3 rounded-full pl-6 pr-2 text-[15px] font-semibold ${look} ${className}`}>
      {children}
      <ArrowDisc tone={disc} size={36} />
    </Link>
  );
}

export function Chip({ children, dot = "violet", className = "" }: { children: React.ReactNode; dot?: "violet" | "brass" | "ok"; className?: string }) {
  const c = dot === "violet" ? "bg-violet" : dot === "brass" ? "bg-brass" : "bg-ok";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink-2 shadow-[0_6px_16px_-8px_rgb(40_24_80/0.25)] ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c}`} />
      {children}
    </span>
  );
}

export function PageHero({ clause, title, lede, children }: { clause: string; title: React.ReactNode; lede: string; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden pb-16 pt-36 sm:pb-24 sm:pt-44">
      <div className="gridlines pointer-events-none absolute inset-0 -z-10" />
      <FloatDots />
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="rise">
          <Eyebrow>{clause}</Eyebrow>
        </div>
        <h1 className="display rise mt-6 max-w-4xl text-[52px] leading-[0.95] sm:text-[88px]" style={{ "--delay": "60ms" } as React.CSSProperties}>
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

export function SectionHead({ clause, title, body, dark = false, id, aside }: { clause: string; title: React.ReactNode; body?: string; dark?: boolean; id?: string; aside?: boolean }) {
  if (aside) {
    return (
      <Reveal className="grid items-end gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <Eyebrow dark={dark}>
            <span id={id} className="scroll-mt-28">
              {clause}
            </span>
          </Eyebrow>
          <h2 className="display mt-5 text-[44px] leading-[0.98] sm:text-[64px]">{title}</h2>
        </div>
        {body && <p className={`max-w-md pb-2 text-[15.5px] leading-relaxed ${dark ? "text-white/60" : "text-muted"}`}>{body}</p>}
      </Reveal>
    );
  }
  return (
    <Reveal className="max-w-3xl">
      <Eyebrow dark={dark}>
        <span id={id} className="scroll-mt-28">
          {clause}
        </span>
      </Eyebrow>
      <h2 className="display mt-5 text-[44px] leading-[0.98] sm:text-[64px]">{title}</h2>
      {body && <p className={`mt-6 max-w-2xl text-[17px] leading-relaxed ${dark ? "text-white/60" : "text-muted"}`}>{body}</p>}
    </Reveal>
  );
}

/**
 * Words light up from faint to ink as the paragraph scrolls through the
 * viewport. Wrap accent words in [brackets] to set them in violet.
 */
export function WordReveal({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  // Accent runs: a word opens with [ and the run continues until a word closes with ].
  let inRun = false;
  const marked = text.split(" ").map((w) => {
    const opens = w.startsWith("[");
    const closes = /\]\W*$/.test(w);
    const accent = inRun || opens;
    if (opens) inRun = true;
    if (closes) inRun = false;
    return { w: w.replace(/[[\]]/g, ""), accent };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLSpanElement>("span[data-w]"));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      spans.forEach((s) => (s.style.opacity = "1"));
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the paragraph's top is at 85% of the viewport, 1 when its bottom reaches 45%.
      const start = vh * 0.85;
      const end = vh * 0.45;
      const p = Math.min(1, Math.max(0, (start - r.top) / (start - end + r.height)));
      const lit = p * spans.length;
      spans.forEach((s, i) => {
        const o = Math.min(1, Math.max(0, lit - i));
        s.style.opacity = String(0.16 + o * 0.84);
      });
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <p ref={ref} className={className} aria-label={marked.map((m) => m.w).join(" ")}>
      {marked.map((m, i) => (
        <span key={i} aria-hidden data-w="" className={`transition-opacity duration-300 ${m.accent ? "text-violet" : ""}`} style={{ opacity: 0.16 }}>
          {m.w}{" "}
        </span>
      ))}
    </p>
  );
}

/**
 * Oversized words that drift sideways on their own and run faster, and in the
 * scroll's direction, while the page is moving.
 */
export function BigMarquee({ items, className = "" }: { items: string[]; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let x = 0;
    let dir = -1;
    let raf = 0;
    let last = performance.now();
    let lastY = window.scrollY;
    const loop = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      const lenis = getLenis();
      const v = lenis ? lenis.velocity : window.scrollY - lastY;
      lastY = window.scrollY;
      if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
      const speed = 0.045 + Math.min(1.2, Math.abs(v) * 0.04);
      x += dir * speed * dt;
      const half = el.scrollWidth / 2;
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      el.style.transform = `translate3d(${x}px,0,0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const row = [...items, ...items];
  return (
    <div className={`relative overflow-hidden py-6 ${className}`} aria-label={items.join(", ")}>
      <div ref={track} className="flex w-max items-center whitespace-nowrap will-change-transform" aria-hidden>
        {row.map((t, i) => (
          <span key={i} className="flex items-center">
            <span className="display px-8 text-[64px] leading-none sm:text-[120px] lg:text-[148px]" style={{ fontStyle: "italic", letterSpacing: "-0.05em" }}>
              {t}
            </span>
            <span className={`h-4 w-4 rounded-full sm:h-6 sm:w-6 ${i % 2 ? "bg-brass" : "bg-violet"}`} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Small marquee of facts, kept for pages that want a quieter band. */
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="marquee relative overflow-hidden py-5" aria-label={items.join(". ")}>
      <div className="marquee-track flex w-max animate-marquee gap-4 whitespace-nowrap" aria-hidden>
        {row.map((t, i) => (
          <Chip key={i} dot={i % 3 === 1 ? "brass" : "violet"}>
            {t}
          </Chip>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-paper to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-paper to-transparent" />
    </div>
  );
}

/** Scattered dots that drift with the pointer: the hero's particles, at rest. */
export function FloatDots({ count = 22, dark = false }: { count?: number; dark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dots] = useState(() =>
    Array.from({ length: count }, (_, i) => {
      // Deterministic scatter so server and client agree.
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12345.678;
      const fx = a - Math.floor(a);
      const fy = b - Math.floor(b);
      return { x: Math.round(fx * 10000) / 100, y: Math.round(fy * 10000) / 100, r: 3 + ((i * 7) % 5), d: 0.4 + ((i * 13) % 10) / 10, c: i % 5 === 0 ? "brass" : i % 3 === 0 ? "violet" : "faint" };
    }),
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const move = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth - 0.5;
      target.y = e.clientY / window.innerHeight - 0.5;
    };
    const loop = () => {
      cur.x += (target.x - cur.x) * 0.05;
      cur.y += (target.y - cur.y) * 0.05;
      el.querySelectorAll<HTMLSpanElement>("span[data-d]").forEach((s) => {
        const d = Number(s.dataset.d);
        s.style.transform = `translate3d(${cur.x * d * -40}px, ${cur.y * d * -40}px, 0)`;
      });
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
    };
  }, []);
  const tone = { brass: "bg-brass/50", violet: dark ? "bg-lilac/40" : "bg-violet/35", faint: dark ? "bg-white/15" : "bg-ink/15" } as const;
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {dots.map((d, i) => (
        <span
          key={i}
          data-d={d.d}
          className={`absolute rounded-full ${tone[d.c as keyof typeof tone]}`}
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.r, height: d.r }}
        />
      ))}
    </div>
  );
}

export function Cta({ title, body, primary = { href: "/demo", label: "Try the demo" }, secondary = { href: "/how-it-works", label: "How it works" } }: {
  title: React.ReactNode;
  body: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="px-4 py-16 sm:px-8 sm:py-24">
      <Reveal className="mx-auto max-w-6xl">
        <div className="grain relative overflow-hidden rounded-[36px] bg-night px-7 py-16 text-white sm:px-14 sm:py-20">
          <Rings />
          <div className="relative max-w-2xl">
            <Eyebrow dark>Let&apos;s move some money</Eyebrow>
            <h2 className="display mt-6 text-[46px] leading-[0.96] sm:text-[76px]">{title}</h2>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/65">{body}</p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <PillLink href={primary.href} tone="violet">
                {primary.label}
              </PillLink>
              <PillLink href={secondary.href} tone="white">
                {secondary.label}
              </PillLink>
            </div>
            <div className="mt-10 space-y-1 font-mono text-[12px] tracking-[0.06em] text-white/45">
              <div>Held by PayPal · released on proof</div>
              <div>Sandbox demo · no real money moves</div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** The mark's two bars, drawn as concentric rings that turn slowly. */
export function Rings({ className = "absolute -right-40 -top-40 h-[560px] w-[560px] sm:-right-24" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 560 560" className={`pointer-events-none ${className}`}>
      <g className="origin-center animate-[spin_60s_linear_infinite]" style={{ transformBox: "fill-box" }}>
        <circle cx="280" cy="280" r="200" fill="none" stroke="rgb(122 82 244 / 0.35)" strokeWidth="90" />
        <circle cx="280" cy="280" r="270" fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="1.5" strokeDasharray="2 10" />
        <circle cx="280" cy="80" r="16" fill="var(--color-brass)" />
      </g>
    </svg>
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

/** Accordion cards: one open at a time, a disc that turns from plus to minus. */
export function Faq({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-3">
      {items.map(([q, a], i) => {
        const on = open === i;
        return (
          <div key={q} className={`clay overflow-hidden rounded-[22px] transition-shadow`}>
            <button
              className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left text-[16.5px] font-semibold tracking-tight"
              aria-expanded={on}
              onClick={() => setOpen(on ? -1 : i)}
            >
              {q}
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-300 ${on ? "bg-violet text-white" : "bg-paper text-ink"}`} aria-hidden>
                <span className="relative h-3 w-3">
                  <span className="absolute left-0 top-1/2 h-[2px] w-3 -translate-y-1/2 rounded bg-current" />
                  <span className={`absolute left-1/2 top-0 h-3 w-[2px] -translate-x-1/2 rounded bg-current transition-transform duration-500 ${on ? "scale-y-0" : ""}`} />
                </span>
              </span>
            </button>
            <div className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ gridTemplateRows: on ? "1fr" : "0fr" }}>
              <div className="overflow-hidden">
                <p className="max-w-2xl px-6 pb-6 text-[15px] leading-relaxed text-muted">{a}</p>
              </div>
            </div>
          </div>
        );
      })}
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
