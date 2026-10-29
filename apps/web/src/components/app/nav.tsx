"use client";

// The signed-in app's navigation: a sidebar on desktop, a tab bar on phones.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { money } from "@/lib/format";
import { ProofStrip, type StripLine } from "./proof-strip";
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

export interface SidebarJob {
  id: string;
  address: string;
  strip: StripLine[];
}

export function Sidebar({
  waiting,
  name,
  email,
  canCreate,
  heldCents,
  releasedCents,
  jobs,
}: {
  waiting: number;
  name: string;
  email: string | null;
  canCreate: boolean;
  heldCents: number;
  releasedCents: number;
  jobs: SidebarJob[];
}) {
  const path = usePathname() ?? "";
  const router = useRouter();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col overflow-hidden px-4 pb-4 pt-5 text-white lg:flex">
      {/* The night material sits behind; .grain sets position, so it can't share the aside's class list. */}
      <div className="stage grain pointer-events-none !absolute inset-0 -z-10" aria-hidden>
        <div className="dots-dark absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_45%)]" />
      </div>
      <div className="px-2">
        <Logo href="/dashboard" dark />
      </div>

      {/* The ledger: what's held and released right now, across every job. */}
      <Link href="/payments" className="group mt-6 block rounded-[20px] border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
          <span>On the books</span>
          <span className="flex items-center gap-1 text-lilac">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-lilac" /> live
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-white/50">Held</div>
            <div className="num text-[17px] font-semibold">{money(heldCents)}</div>
          </div>
          <div>
            <div className="text-[11px] text-white/50">Released</div>
            <div className="num text-[17px] font-semibold text-lilac">{money(releasedCents)}</div>
          </div>
        </div>
        {jobs.length > 0 && (
          <ul className="mt-3.5 space-y-2.5 border-t border-white/10 pt-3.5">
            {jobs.map((j) => (
              <li key={j.id}>
                <div className="mb-1 truncate text-[11.5px] text-white/60">{j.address}</div>
                <ProofStrip lines={j.strip} size="xs" dark />
              </li>
            ))}
          </ul>
        )}
      </Link>

      {canCreate && (
        <Link href="/jobs/new" className="press mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-semibold text-ink hover:bg-violet-soft">
          <IconPlus /> New job
        </Link>
      )}

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto" aria-label="App">
        {navGroups(waiting).map((g, gi) => (
          <div key={gi}>
            {g.title && <div className="px-3 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{g.title}</div>}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = active(path, it.href);
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={on ? "page" : undefined}
                      className={`group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors ${
                        on ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-lilac" aria-hidden />}
                      <Icon className={`h-[19px] w-[19px] ${on ? "text-lilac" : "text-white/45 group-hover:text-white/80"}`} />
                      <span className="flex-1">{it.label}</span>
                      {!!it.badge && <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-lilac px-1.5 text-[11px] font-bold text-night">{it.badge}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-white/10 pt-4">
        <Link
          href="/settings"
          aria-current={active(path, "/settings") ? "page" : undefined}
          className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors ${active(path, "/settings") ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white"}`}
        >
          <IconSettings className="h-[19px] w-[19px] text-white/45" /> Settings
        </Link>
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lilac text-[13px] font-bold text-night">{(name || email || "G")[0]!.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">{name}</div>
            <div className="truncate text-[12px] text-white/50">{email ?? "Guest"}</div>
          </div>
          <button
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              router.push("/");
              router.refresh();
            }}
            className="press grid h-8 w-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
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
