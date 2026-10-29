"use client";

// The signed-in app's navigation: a sidebar on desktop, a tab bar on phones.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { IconActivity, IconDispute, IconHome, IconInbox, IconJobs, IconMore, IconPlus, IconSettings, IconShield, IconWallet } from "./icons";

type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement; badge?: number };

export function navGroups(waiting: number): { title?: string; items: Item[] }[] {
  return [
    {
      items: [
        { href: "/dashboard", label: "Overview", icon: IconHome },
        { href: "/jobs", label: "Jobs", icon: IconJobs },
        { href: "/approvals", label: "Waiting on you", icon: IconInbox, badge: waiting },
        { href: "/activity", label: "Activity", icon: IconActivity },
      ],
    },
    {
      title: "Money",
      items: [
        { href: "/payments", label: "Payments", icon: IconWallet },
        { href: "/disputes", label: "Disputes", icon: IconDispute },
      ],
    },
    { title: "Controls", items: [{ href: "/rules", label: "Payment rules", icon: IconShield }] },
  ];
}

function active(path: string, href: string): boolean {
  return path === href || path.startsWith(href + "/");
}

export function Sidebar({ waiting, name, email, canCreate }: { waiting: number; name: string; email: string | null; canCreate: boolean }) {
  const path = usePathname() ?? "";
  const router = useRouter();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line bg-card/80 px-4 pb-4 pt-5 backdrop-blur-xl lg:flex">
      <div className="px-2">
        <Logo href="/dashboard" />
      </div>
      {canCreate && (
        <Link href="/jobs/new" className="press btn-primary mt-6 flex h-11 items-center justify-center gap-2 rounded-full text-[14px] font-medium">
          <IconPlus /> New job
        </Link>
      )}
      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto" aria-label="App">
        {navGroups(waiting).map((g, gi) => (
          <div key={gi}>
            {g.title && <div className="px-3 pb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{g.title}</div>}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = active(path, it.href);
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={on ? "page" : undefined}
                      className={`group flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors ${
                        on ? "bg-violet-soft text-violet" : "text-ink-2 hover:bg-paper hover:text-ink"
                      }`}
                    >
                      <Icon className={`h-[19px] w-[19px] ${on ? "text-violet" : "text-muted group-hover:text-ink"}`} />
                      <span className="flex-1">{it.label}</span>
                      {!!it.badge && <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-violet px-1.5 text-[11px] font-semibold text-white">{it.badge}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-line pt-4">
        <Link
          href="/settings"
          aria-current={active(path, "/settings") ? "page" : undefined}
          className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors ${active(path, "/settings") ? "bg-violet-soft text-violet" : "text-ink-2 hover:bg-paper"}`}
        >
          <IconSettings className="h-[19px] w-[19px] text-muted" /> Settings
        </Link>
        <div className="flex items-center gap-3 rounded-2xl bg-paper p-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet text-[13px] font-semibold text-white">{(name || email || "G")[0]!.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">{name}</div>
            <div className="truncate text-[12px] text-muted">{email ?? "Guest"}</div>
          </div>
          <button
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              router.push("/");
              router.refresh();
            }}
            className="press grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-card hover:text-bad"
            aria-label="Sign out"
            title="Sign out"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M14 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20h-4M10 16l-4-4 4-4M6 12h10" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Phones: four tabs and More. */
export function TabBar({ waiting }: { waiting: number }) {
  const path = usePathname() ?? "";
  const [more, setMore] = useState(false);
  const tabs: Item[] = [
    { href: "/dashboard", label: "Overview", icon: IconHome },
    { href: "/jobs", label: "Jobs", icon: IconJobs },
    { href: "/approvals", label: "To do", icon: IconInbox, badge: waiting },
    { href: "/payments", label: "Payments", icon: IconWallet },
  ];
  const extra: Item[] = [
    { href: "/activity", label: "Activity", icon: IconActivity },
    { href: "/disputes", label: "Disputes", icon: IconDispute },
    { href: "/rules", label: "Payment rules", icon: IconShield },
    { href: "/settings", label: "Settings", icon: IconSettings },
  ];
  const moreOn = extra.some((x) => active(path, x.href));
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] lg:hidden" onClick={() => setMore(false)}>
          <div className="toast-in absolute inset-x-3 bottom-[84px] rounded-3xl bg-card p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {extra.map((x) => {
              const Icon = x.icon;
              return (
                <Link key={x.href} href={x.href} onClick={() => setMore(false)} className={`flex h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-medium ${active(path, x.href) ? "bg-violet-soft text-violet" : "hover:bg-paper"}`}>
                  <Icon className="h-5 w-5" /> {x.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="App">
        <ul className="mx-auto grid h-[68px] max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const on = active(path, t.href);
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={on ? "page" : undefined} className={`relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? "text-violet" : "text-muted"}`}>
                  <Icon className="h-[22px] w-[22px]" />
                  {t.label}
                  {!!t.badge && <span className="num absolute right-[22%] top-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-violet px-1 text-[10px] font-semibold text-white">{t.badge}</span>}
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
