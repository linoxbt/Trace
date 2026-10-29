"use client";

import Link from "next/link";
import { useState } from "react";
import type { ActivityItem } from "@/server/app-data";
import { eventDot, eventGroup, eventLabel, GUARD_EVENTS } from "@/lib/events";
import { when } from "@/lib/format";
import { ShieldIcon } from "@/components/guard";

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "money", label: "Money" },
  { id: "proof", label: "Proof" },
  { id: "guard", label: "Guard" },
  { id: "job", label: "Jobs" },
] as const;

export function ActivityList({ items, compact = false }: { items: ActivityItem[]; compact?: boolean }) {
  return (
    <ol className="relative">
      <span className="absolute bottom-2 left-[5px] top-2 w-px bg-line" aria-hidden />
      {items.map((e) => (
        <li key={e.id} className={`relative flex gap-3 ${compact ? "pb-3" : "pb-4"} last:pb-0`}>
          {GUARD_EVENTS.has(e.type) ? (
            <span className={`relative grid h-[15px] w-[15px] shrink-0 -translate-x-[2px] place-items-center rounded-full text-white ring-4 ring-card ${eventDot(e)}`}>
              <ShieldIcon className="h-2.5 w-2.5" />
            </span>
          ) : (
            <span className={`relative mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-card ${eventDot(e)}`} />
          )}
          <div className="min-w-0 flex-1">
            <div className={`leading-snug ${compact ? "text-[13.5px]" : "text-[14.5px]"}`}>{eventLabel(e)}</div>
            <div className={`mt-0.5 text-[12px] text-faint ${compact ? "" : "flex flex-wrap gap-x-1.5"}`}>
              <Link href={`/jobs/${e.jobId}`} className={`text-muted hover:text-violet ${compact ? "block truncate" : ""}`}>
                {e.address}
              </Link>
              {!compact && <span>·</span>}
              <span className="num">{when(e.at)}</span>
              {!compact && (
                <>
                  <span>·</span>
                  <span>{e.actor}</span>
                </>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [f, setF] = useState<(typeof FILTERS)[number]["id"]>("all");
  const shown = f === "all" ? items : items.filter((e) => eventGroup(e.type) === f);
  return (
    <div>
      <div role="tablist" aria-label="Filter activity" className="flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={f === x.id}
            onClick={() => setF(x.id)}
            className={`press h-9 rounded-full px-4 font-mono text-[11px] uppercase tracking-[0.12em] ${f === x.id ? "bg-ink text-white" : "bg-card text-ink-2 shadow-[0_0_0_1px_var(--color-line)] hover:bg-paper"}`}
          >
            {x.label}
            <span className={`num ml-1.5 ${f === x.id ? "text-white/60" : "text-faint"}`}>{x.id === "all" ? items.length : items.filter((e) => eventGroup(e.type) === x.id).length}</span>
          </button>
        ))}
      </div>
      <div className="clay mt-6 rounded-[26px] pb-2">
        {shown.length ? <AuditTape items={shown} /> : <p className="p-8 text-[14px] text-muted">Nothing here yet.</p>}
      </div>
    </div>
  );
}

function day(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** The log as an audit tape: one band per day, a mono time column, the job on the right. */
function AuditTape({ items }: { items: ActivityItem[] }) {
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const e of items) {
    const d = day(e.at);
    const last = groups.at(-1);
    if (last && last.day === d) last.items.push(e);
    else groups.push({ day: d, items: [e] });
  }
  return (
    <div>
      {groups.map((g, gi) => (
        <section key={g.day}>
          <div className={`sticky top-16 z-10 flex items-center gap-3 border-b border-line bg-paper/95 px-5 py-2.5 backdrop-blur sm:px-7 ${gi === 0 ? "rounded-t-[26px]" : ""}`}>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">{g.day}</span>
            <span className="num text-[11px] text-faint">{g.items.length} entr{g.items.length === 1 ? "y" : "ies"}</span>
          </div>
          <ol className="divide-y divide-dashed divide-line-2">
            {g.items.map((e) => (
              <li key={e.id} className="grid grid-cols-[64px_18px_minmax(0,1fr)] items-start gap-3 px-5 py-3.5 sm:grid-cols-[76px_18px_minmax(0,1fr)_auto] sm:px-7">
                <span className="num pt-0.5 text-[12px] text-faint">{new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                {GUARD_EVENTS.has(e.type) ? (
                  <span className={`mt-0.5 grid h-[16px] w-[16px] place-items-center rounded-full text-white ${eventDot(e)}`}>
                    <ShieldIcon className="h-2.5 w-2.5" />
                  </span>
                ) : (
                  <span className={`mt-[5px] h-[10px] w-[10px] justify-self-center rounded-full ${eventDot(e)}`} />
                )}
                <div className="min-w-0">
                  <div className="text-[14.5px] leading-snug">{eventLabel(e)}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">by {e.actor}</div>
                  <Link href={`/jobs/${e.jobId}`} className="mt-1 block truncate text-[12.5px] text-muted hover:text-violet sm:hidden">
                    {e.address}
                  </Link>
                </div>
                <Link href={`/jobs/${e.jobId}`} className="hidden max-w-[260px] truncate rounded-full border border-line bg-card px-3 py-1 text-[12px] text-ink-2 hover:border-violet hover:text-violet sm:block">
                  {e.address}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
