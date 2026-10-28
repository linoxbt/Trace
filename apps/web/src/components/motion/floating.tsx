"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLenis } from "./smooth-scroll";

// Bottom-right: back to the top (its ring fills as you read down the page),
// and the demo, always one tap away.
export function Floating() {
  const path = usePathname();
  const ring = useRef<SVGCircleElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      setShown(window.scrollY > 500);
      if (ring.current) ring.current.style.strokeDashoffset = String(113 * (1 - p));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const top = () => {
    const l = getLenis();
    if (l) l.scrollTo(0, { duration: 1.4 });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-center gap-3 sm:bottom-7 sm:right-7">
      <button
        onClick={top}
        aria-label="Back to top"
        className={`press relative grid h-12 w-12 place-items-center rounded-full bg-white text-ink shadow-[0_10px_24px_-10px_rgb(40_24_80/0.35)] transition-all duration-500 ${
          shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="18" fill="none" stroke="var(--color-line)" strokeWidth="2" />
          <circle ref={ring} cx="24" cy="24" r="18" fill="none" stroke="var(--color-violet)" strokeWidth="2" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="113" />
        </svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
      {path !== "/demo" && (
        <Link href="/demo" aria-label="Try the demo" data-cursor="Demo" className="press relative grid h-14 w-14 place-items-center rounded-full btn-primary">
          <span className="absolute inset-0 animate-ping-slow rounded-full border-2 border-violet/50" aria-hidden />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
          </svg>
        </Link>
      )}
    </div>
  );
}
