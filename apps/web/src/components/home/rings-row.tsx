"use client";

import { useEffect, useRef, useState } from "react";

// Three numbered rings on a line that draws itself through them as the row
// scrolls into view. Used on the dark "why" section.

export function RingsRow({ items }: { items: { title: string; body: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      setP(Math.min(1, Math.max(0, (vh * 0.9 - r.top) / (vh * 0.55))));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, []);
  const n = items.length;
  return (
    <div ref={ref} className="relative">
      <div className="absolute left-[16.6%] right-[16.6%] top-[44px] hidden h-[2px] bg-white/10 md:block" />
      <div className="absolute left-[16.6%] top-[44px] hidden h-[2px] bg-gradient-to-r from-lilac to-violet-bright md:block" style={{ width: `${p * 66.8}%` }} />
      <ol className="relative grid gap-12 md:grid-cols-3 md:gap-6">
        {items.map((it, i) => {
          const lit = p >= i / Math.max(1, n - 1) - 0.02;
          return (
            <li key={it.title} className="flex flex-col items-center text-center">
              <span
                className={`relative grid h-[88px] w-[88px] place-items-center rounded-full border-[10px] transition-colors duration-700 ${
                  lit ? "border-violet bg-night-3" : "border-night-3 bg-night-2"
                }`}
              >
                <span className="display text-[26px]">{String(i + 1).padStart(2, "0")}</span>
                {lit && <span className="absolute -inset-[10px] animate-ping-slow rounded-full border border-lilac/50" />}
              </span>
              <h3 className="mt-6 text-[19px] font-semibold">{it.title}</h3>
              <p className="mt-2 max-w-[280px] text-[14.5px] leading-relaxed text-white/55">{it.body}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
