"use client";

import { useEffect, useRef, useState } from "react";

// A ring that trails the pointer and a dot that sits on it. Over links and
// buttons the ring opens up; over anything with data-cursor="Label" it becomes
// a dark disc that says what a click will do. Fine pointers only.
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || still) return;
    document.documentElement.classList.add("has-cursor");
    setOn(true);
    const p = { x: -100, y: -100 };
    const r = { x: -100, y: -100 };
    let raf = 0;
    const move = (e: PointerEvent) => {
      p.x = e.clientX;
      p.y = e.clientY;
      const t = (e.target as Element | null)?.closest?.("[data-cursor], a, button, summary, [role=tab], input, textarea, select");
      setLabel(t?.getAttribute("data-cursor") ?? null);
      setHover(!!t && !t.matches("input, textarea, select"));
    };
    const loop = () => {
      r.x += (p.x - r.x) * 0.18;
      r.y += (p.y - r.y) * 0.18;
      if (ring.current) ring.current.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
      if (dot.current) dot.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    const leave = () => {
      p.x = -100;
      p.y = -100;
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  if (!on) return null;
  const size = label ? 76 : hover ? 46 : 30;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      <div ref={ring} className="absolute left-0 top-0">
        <div
          className={`-translate-x-1/2 -translate-y-1/2 rounded-full transition-[width,height,background-color,border-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            label ? "grid place-items-center border border-ink bg-ink" : hover ? "border border-violet/60 bg-violet/[0.06]" : "border border-ink/30"
          }`}
          style={{ width: size, height: size }}
        >
          {label && <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white">{label}</span>}
        </div>
      </div>
      <div ref={dot} className="absolute left-0 top-0">
        <div className={`h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet transition-opacity ${label ? "opacity-0" : ""}`} />
      </div>
    </div>
  );
}
