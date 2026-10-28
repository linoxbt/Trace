"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { ArrowDisc } from "./blocks";
import { getLenis } from "@/components/motion/smooth-scroll";

export const SITE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/homeowners", label: "Homeowners" },
  { href: "/tradespeople", label: "Tradespeople" },
  { href: "/security", label: "Security" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Tuck the bar away while reading down; bring it back on any scroll up.
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      setHidden(y > 200 && y > last + 2);
      if (y < last - 2) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const l = getLenis();
    if (open) l?.stop();
    else l?.start();
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  useEffect(() => setOpen(false), [path]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 px-3 pt-3 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-5 sm:pt-4 ${hidden && !open ? "-translate-y-28" : ""}`}>
      <nav className="glass mx-auto flex h-[66px] max-w-6xl items-center justify-between rounded-full border border-white pl-5 pr-2.5 shadow-[0_12px_32px_-14px_rgb(40_24_80/0.28)]" aria-label="Main">
        <Logo />
        <div className="hidden items-center gap-1 lg:flex">
          {SITE_LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-full px-4 py-2 text-[14px] font-medium transition-colors ${active ? "bg-paper text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {l.label}
                {active && <span className="absolute bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet" />}
              </Link>
            );
          })}
        </div>
        <div className="hidden items-center gap-1 lg:flex">
          <Link href="/sign-in" className="press rounded-full px-4 py-2 text-[14px] font-medium text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/demo" className="pill press btn-primary inline-flex h-12 items-center gap-2.5 rounded-full pl-5 pr-1.5 text-[14px] font-semibold">
            Try the demo <ArrowDisc tone="white" size={36} />
          </Link>
        </div>
        <button
          className="press grid h-12 w-12 place-items-center rounded-full bg-ink text-white lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="relative block h-3 w-[18px]">
            <span className={`absolute left-0 h-[2px] w-[18px] rounded bg-white transition-all duration-300 ${open ? "top-[5px] rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 h-[2px] w-[18px] rounded bg-white transition-all duration-300 ${open ? "top-[5px] -rotate-45" : "top-[10px]"}`} />
          </span>
        </button>
      </nav>

      <div
        className={`fixed inset-x-3 bottom-3 top-[86px] overflow-auto rounded-[30px] bg-white px-6 pb-6 pt-4 shadow-[0_30px_60px_-20px_rgb(40_24_80/0.35)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
        }`}
      >
        <div className="flex flex-col">
          {SITE_LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              className={`display flex items-center justify-between border-b border-line py-4 text-[32px] leading-none transition-all duration-700 ${open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
              style={{ transitionDelay: open ? `${80 + i * 50}ms` : "0ms" }}
            >
              {l.label}
              {path === l.href && <span className="h-2 w-2 rounded-full bg-violet" />}
            </Link>
          ))}
        </div>
        <div className="mt-8 grid gap-3">
          <Link href="/demo" className="pill press btn-primary flex h-14 items-center justify-between rounded-full pl-6 pr-2 font-semibold">
            Try the demo <ArrowDisc tone="white" size={40} />
          </Link>
          <Link href="/sign-in" className="press flex h-14 items-center justify-center rounded-full bg-paper font-semibold">
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
