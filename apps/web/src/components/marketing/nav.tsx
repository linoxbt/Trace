"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#ledger", label: "The money" },
  { href: "#proof", label: "Proof" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
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
  }, [open]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${scrolled ? "glass border-b border-line/70" : "border-b border-transparent"}`}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Main">
        <Logo />
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-[14px] text-ink-2 transition-colors hover:bg-ink/[0.04] hover:text-ink">
              {l.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/sign-in" className="press rounded-full px-4 py-2 text-[14px] font-medium text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/jobs/new" className="press btn-ink rounded-full px-4 py-2 text-[14px] font-medium">
            Start a job
          </Link>
        </div>
        <button
          className="press grid h-10 w-10 place-items-center rounded-full md:hidden"
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
        className={`fixed inset-x-0 top-16 bottom-0 bg-paper px-5 pt-4 transition-all duration-500 md:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="flex flex-col">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-line py-4 text-[20px] font-medium tracking-tight">
              {l.label}
            </a>
          ))}
        </div>
        <div className="mt-8 grid gap-3">
          <Link href="/jobs/new" className="press btn-ink flex h-12 items-center justify-center rounded-full font-medium">
            Start a job
          </Link>
          <Link href="/sign-in" className="press flex h-12 items-center justify-center rounded-full border border-line bg-card font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
