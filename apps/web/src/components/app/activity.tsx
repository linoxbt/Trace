"use client";

import { useState } from "react";
import type { ActivityItem } from "@/server/app-data";
import { eventGroup, eventLabel } from "@/lib/events";
import { money } from "@/lib/format";
import { IconCamera, IconDoc, IconShield, IconWallet } from "./icons";
import { DayLabel, IconCircle, Row, type Tone } from "./ui";
import { Segmented } from "./segmented";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "money", label: "Money" },
  { id: "proof", label: "Proof" },
  { id: "guard", label: "Guard" },
  { id: "job", label: "Jobs" },
] as const;

function tone(e: ActivityItem): Tone {
  const t = e.type;
  if (t === "CAPTURED" || t === "GUARD_ALLOWED" || t === "GUARD_APPROVED" || t === "LINE_APPROVED" || t === "LINE_AUTO_APPROVED") return "green";
  if (t.includes("FAILED") || t.includes("DENIED") || t === "GUARD_BLOCKED" || t === "INJECTION_FLAGGED" || t.startsWith("DISPUTE")) return "red";
  if (t === "GUARD_APPROVAL_NEEDED" || t === "LINE_FLAGGED") return "amber";
  if (t === "VERDICT") return e.data?.verdict === "VERIFIED" ? "green" : e.data?.verdict === "FAILED" ? "red" : "amber";
  if (t === "AUTHORIZED" || t === "RELEASE_STARTED") return "violet";
  return "grey";
}

function Icon({ e }: { e: ActivityItem }) {
  const g = eventGroup(e.type);
  const I = g === "money" ? IconWallet : g === "proof" ? IconCamera : g === "guard" ? IconShield : IconDoc;
  return (
    <IconCircle tone={tone(e)}>
      <I className="h-[19px] w-[19px]" />
    </IconCircle>
  );
}

export function dayOf(iso: string): string {
  const d = new Date(iso);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, new Date())) return "Today";
  if (same(d, new Date(Date.now() - 86400000))) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Activity as a bank's transaction list: grouped by day, one row per event. */
export function ActivityRows({ items }: { items: ActivityItem[] }) {
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const e of items) {
    const d = dayOf(e.at);
    const last = groups.at(-1);
    if (last && last.day === d) last.items.push(e);
    else groups.push({ day: d, items: [e] });
  }
  return (
    <div className="pb-2">
      {groups.map((g) => (
        <div key={g.day}>
          <DayLabel>{g.day}</DayLabel>
          {g.items.map((e) => {
            const cents = typeof e.data?.amount_cents === "number" ? (e.data.amount_cents as number) : null;
            const showAmount = cents !== null && eventGroup(e.type) === "money";
            return (
              <Row
                key={e.id}
                href={`/jobs/${e.jobId}`}
                icon={<Icon e={e} />}
                title={showAmount ? eventLabel(e).replace(/ · \$[\d,.]+$/, "") : eventLabel(e)}
                sub={`${e.address} · ${e.actor}`}
                value={showAmount ? money(cents!) : undefined}
                valueTone={e.type === "CAPTURED" ? "green" : "ink"}
                meta={time(e.at)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [f, setF] = useState<(typeof FILTERS)[number]["id"]>("all");
  const shown = f === "all" ? items : items.filter((e) => eventGroup(e.type) === f);
  return (
    <div>
      <Segmented label="Filter activity" value={f} onChange={setF} options={FILTERS.map((x) => ({ id: x.id, label: x.label, count: x.id === "all" ? items.length : items.filter((e) => eventGroup(e.type) === x.id).length }))} />
      <div className="mt-4 overflow-hidden rounded-[22px] border border-[#ebebf0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {shown.length ? <ActivityRows items={shown} /> : <p className="p-8 text-[14px] text-muted">Nothing here yet.</p>}
      </div>
    </div>
  );
}
