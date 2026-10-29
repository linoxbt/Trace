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
            className={`press h-9 rounded-full px-4 text-[13px] font-medium ${f === x.id ? "bg-ink text-white" : "bg-card text-ink-2 shadow-[0_0_0_1px_var(--color-line)] hover:bg-paper"}`}
          >
            {x.label}
            <span className={`num ml-1.5 ${f === x.id ? "text-white/60" : "text-faint"}`}>{x.id === "all" ? items.length : items.filter((e) => eventGroup(e.type) === x.id).length}</span>
          </button>
        ))}
      </div>
      <div className="surface mt-5 rounded-[24px] p-5 sm:p-7">
        {shown.length ? <ActivityList items={shown} /> : <p className="text-[14px] text-muted">Nothing here yet.</p>}
      </div>
    </div>
  );
}
