"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";

/** A number that glides to its new value instead of jumping. */
export function useTween(target: number, ms = 900): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 4);
      const v = a + (target - a) * eased;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, ms]);
  return value;
}

export function Money({ cents, currency = "USD", className = "" }: { cents: number; currency?: string; className?: string }) {
  const v = useTween(cents);
  return <span className={`num ${className}`}>{money(Math.round(v), currency)}</span>;
}
