"use client";

// The signed-in app's navigation, banking-app style: tabs across the top on
// desktop, a tab bar along the bottom on phones, and an account menu.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { IconActivity, IconBell, IconDispute, IconHome, IconInbox, IconJobs, IconMore, IconPlus, IconSettings, IconShield, IconWallet } from "./icons";

const TABS = [
  { href: "/dashboard", label: "Home" },
  { href: "/jobs", label: "Jobs" },
  { href: "/payments", label: "Payments" },
  { href: "/activity", label: "Activity" },
];

function active(path: string, href: string): boolean {
  return path === href || path.startsWith(href + "/");
}

export function TopNav({ waiting, name, email, canCreate }: { waiting: number; name: string; email: string | null; canCreate: boolean }) {
  const path = usePathname() ?? "";
  return (
    <header className="sticky top-0 z-30 border-b border-[#ebebf0] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-6 px-4 sm:px-6">
        <Logo href="/dashboard" size={26} />
        <nav className="hidden h-full items-stretch gap-1 md:flex" aria-label="App">
          {TABS.map((t) => {
            const on = active(path, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex items-center px-3 text-[14.5px] font-medium transition-colors ${on ? "text-ink" : "text-muted hover:text-ink"}`}
              >
                {t.label}
                {on && <span className="absolute inset-x-3 bottom-0 h-[2.5px] rounded-full bg-violet" aria-hidden />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {canCreate && (
            <Link href="/jobs/new" className="press hidden h-9 items-center gap-1.5 rounded-full bg-violet px-4 text-[13.5px] font-semibold text-white hover:bg-violet-deep sm:inline-flex">
              <IconPlus /> New job
            </Link>
          )}
          <Link
            href="/approvals"
            aria-label={`To do: ${waiting}`}
            className={`press relative grid h-10 w-10 place-items-center rounded-full transition-colors ${active(path, "/approvals") ? "bg-violet-soft text-violet" : "text-ink-2 hover:bg-[#f1f1f5]"}`}
          >
            <IconBell />
            {waiting > 0 && <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-violet px-1 text-[10.5px] font-semibold text-white ring-2 ring-white">{waiting}</span>}
          </Link>
          <AccountMenu name={name} email={email} />
        </div>
      </div>
    </header>
  );
}

export function AccountMenu({ name, email }: { name: string; email: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const links = [
    { href: "/settings", label: "Settings", icon: IconSettings },
    { href: "/rules", label: "Payment rules", icon: IconShield },
    { href: "/disputes", label: "Disputes", icon: IconDispute },
  ];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account"
        className="press grid h-10 w-10 place-items-center rounded-full bg-violet-soft text-[14px] font-semibold text-violet ring-violet/20 hover:ring-4"
      >
        {(name || email || "G")[0]!.toUpperCase()}
      </button>
      <div
        className={`absolute right-0 top-12 w-64 origin-top-right rounded-2xl border border-[#ebebf0] bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(16,24,40,0.25)] transition-all duration-200 ${
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <div className="px-3 py-2.5">
          <div className="truncate text-[14px] font-semibold">{name}</div>
          <div className="truncate text-[12.5px] text-muted">{email ?? "Guest"}</div>
        </div>
        <div className="my-1 h-px bg-[#ebebf0]" />
        {links.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] hover:bg-[#f5f5f8]">
            <l.icon className="h-[18px] w-[18px] text-muted" /> {l.label}
          </Link>
        ))}
        <div className="my-1 h-px bg-[#ebebf0]" />
        <button
          onClick={async () => {
            await supabaseBrowser().auth.signOut();
            router.push("/");
            router.refresh();
          }}
          className="flex h-10 w-full items-center rounded-xl px-3 text-left text-[14px] text-bad hover:bg-bad-soft"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Phones: a tab bar along the bottom, with More for the rest. */
export function TabBar({ waiting }: { waiting: number }) {
  const path = usePathname() ?? "";
  const [more, setMore] = useState(false);
  const tabs = [
    { href: "/dashboard", label: "Home", icon: IconHome, badge: 0 },
    { href: "/jobs", label: "Jobs", icon: IconJobs, badge: 0 },
    { href: "/approvals", label: "To do", icon: IconInbox, badge: waiting },
    { href: "/payments", label: "Payments", icon: IconWallet, badge: 0 },
  ];
  const extra = [
    { href: "/activity", label: "Activity", icon: IconActivity },
    { href: "/rules", label: "Payment rules", icon: IconShield },
    { href: "/disputes", label: "Disputes", icon: IconDispute },
    { href: "/settings", label: "Settings", icon: IconSettings },
  ];
  const moreOn = extra.some((x) => active(path, x.href));
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 bg-ink/25 md:hidden" onClick={() => setMore(false)}>
          <div className="toast-in absolute inset-x-3 bottom-[80px] rounded-3xl bg-white p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {extra.map((x) => (
              <Link key={x.href} href={x.href} onClick={() => setMore(false)} className={`flex h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-medium ${active(path, x.href) ? "bg-violet-soft text-violet" : "hover:bg-[#f5f5f8]"}`}>
                <x.icon className="h-5 w-5" /> {x.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ebebf0] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="App">
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const on = active(path, t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={on ? "page" : undefined} className={`relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? "text-violet" : "text-muted"}`}>
                  <t.icon className="h-[22px] w-[22px]" />
                  {t.label}
                  {!!t.badge && <span className="absolute right-[22%] top-2 grid h-4 min-w-4 place-items-center rounded-full bg-violet px-1 text-[10px] font-semibold text-white">{t.badge}</span>}
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => setMore((m) => !m)} aria-expanded={more} className={`flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${moreOn || more ? "text-violet" : "text-muted"}`}>
              <IconMore className="h-[22px] w-[22px]" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
