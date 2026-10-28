"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

export const SITE_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/homeowners", label: "Homeowners" },
  { href: "/tradespeople", label: "Tradespeople" },
  { href: "/security", label: "Security" },
];

export function Nav() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  useEffect(() => setOpen(false), [path]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${scrolled || open ? "glass border-b border-line/80" : "border-b border-transparent"}`}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Main">
        <Logo />
        <div className="hidden items-center gap-0.5 lg:flex">
          {SITE_LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-[14px] transition-colors ${active ? "bg-ink/[0.06] text-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/sign-in" className="press rounded-full px-4 py-2 text-[14px] font-medium text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/demo" className="press btn-primary rounded-full px-4 py-2 text-[14px] font-medium">
            Try the demo
          </Link>
        </div>
        <button
          className="press grid h-10 w-10 place-items-center rounded-full lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="relative block h-3 w-5">
            <span className={`absolute left-0 h-[1.5px] w-5 bg-ink transition-all duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 h-[1.5px] w-5 bg-ink transition-all duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
          </span>
        </button>
      </nav>
      <div
        className={`fixed inset-x-0 bottom-0 top-16 bg-paper px-5 pt-4 transition-all duration-500 lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="flex flex-col">
          {[{ href: "/", label: "Home" }, ...SITE_LINKS].map((l) => (
            <Link key={l.href} href={l.href} className="display border-b border-line py-4 text-[30px] leading-none">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="mt-8 grid gap-3">
          <Link href="/demo" className="press btn-primary flex h-12 items-center justify-center rounded-full font-medium">
            Try the demo
          </Link>
          <Link href="/sign-in" className="press flex h-12 items-center justify-center rounded-full border border-line bg-card font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
