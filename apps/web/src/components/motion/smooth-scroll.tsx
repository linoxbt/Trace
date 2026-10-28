"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

// One Lenis instance for the whole site. Scroll-linked pieces read it through
// getLenis() for velocity; everything else just listens to window scroll.
let lenis: Lenis | null = null;
export const getLenis = () => lenis;

export function SmoothScroll() {
  const path = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    lenis = new Lenis({ lerp: 0.1, anchors: { offset: -96 }, autoRaf: true });
    return () => {
      lenis?.destroy();
      lenis = null;
    };
  }, []);

  // A new page starts at the top, without gliding there.
  useEffect(() => {
    lenis?.scrollTo(0, { immediate: true, force: true });
  }, [path]);

  return null;
}
