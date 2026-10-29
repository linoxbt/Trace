"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Invite, JobRowView } from "@/server/app-data";
import { money, when } from "@/lib/format";
import { IconChevron, IconMail } from "./icons";
import { Segmented } from "./segmented";
import { IconCircle, Pill, Progress, type Tone } from "./ui";

const GROUPS = {
  all: null,
  active: ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"],
  approval: ["DRAFT", "AWAITING_APPROVAL"],
  done: ["COMPLETED", "CLOSED_VOIDED"],
} as const;
type Tab = keyof typeof GROUPS;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "grey" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "amber" },
  AUTHORIZED: { label: "Money held", tone: "violet" },
  IN_PROGRESS: { label: "In progress", tone: "violet" },
  PARTIALLY_RELEASED: { label: "Part released", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "green" },
  CLOSED_VOIDED: { label: "Closed", tone: "grey" },
};

export function JobsTable({ jobs, invites }: { jobs: JobRowView[]; invites: Invite[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [side, setSide] = useState<"any" | "tradesperson" | "homeowner">("any");
  const [q, setQ] = useState("");
  const inTab = (t: Tab, j: JobRowView) => GROUPS[t] === null || (GROUPS[t] as readonly string[]).includes(j.status);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter((j) => inTab(tab, j) && (side === "any" || j.side === side) && (!needle || j.address.toLowerCase().includes(needle) || j.otherParty.toLowerCase().includes(needle)));
  }, [jobs, tab, side, q]);

  return (
    <div className="flex flex-col gap-5">
      {invites.length > 0 && (
        <section className="overflow-hidden rounded-[22px] border border-violet/20 bg-violet-soft/60">
          <div className="px-5 pb-1 pt-4 text-[13px] font-semibold text-violet sm:px-6">Sent to you</div>
          {invites.map((i) => (
            <Link key={i.id} href={`/jobs/${i.id}`} className="flex items-center gap-3.5 px-5 py-3 hover:bg-violet-soft sm:px-6">
              <IconCircle tone="violet" size={42}>
                <IconMail className="h-5 w-5" />
              </IconCircle>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{i.address}</div>
                <div className="truncate text-[13px] text-muted">
                  {i.from} · {i.lines} line{i.lines === 1 ? "" : "s"} · {when(i.sentAt)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-semibold tabular-nums">{money(i.totalCents)}</div>
                <div className="text-[12.5px] font-medium text-violet">Review</div>
              </div>
            </Link>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Job status"
          value={tab}
          onChange={setTab}
          options={[
            { id: "all", label: "All", count: jobs.length },
            { id: "active", label: "Active", count: jobs.filter((j) => inTab("active", j)).length },
            { id: "approval", label: "Awaiting approval", count: jobs.filter((j) => inTab("approval", j)).length },
            { id: "done", label: "Finished", count: jobs.filter((j) => inTab("done", j)).length },
          ]}
        />
        <div className="flex gap-2">
          <select value={side} onChange={(e) => setSide(e.target.value as typeof side)} className="h-10 rounded-full border border-[#e3e3ea] bg-white px-4 text-[13.5px] outline-none focus:border-violet" aria-label="Your role">
            <option value="any">Any role</option>
            <option value="tradesperson">As tradesperson</option>
            <option value="homeowner">As homeowner</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs"
            className="h-10 w-full min-w-0 rounded-full border border-[#e3e3ea] bg-white px-4 text-[13.5px] outline-none focus:border-violet lg:w-60"
            aria-label="Search jobs"
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-[22px] border border-[#ebebf0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {shown.length === 0 ? (
          <p className="px-6 py-14 text-center text-[14px] text-muted">No jobs match.</p>
        ) : (
          <ul className="divide-y divide-[#f0f0f4]">
            {shown.map((j) => {
              const base = j.heldCents || j.totalCents;
              const s = STATUS[j.status] ?? { label: j.status, tone: "grey" as Tone };
              return (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 px-5 py-4 transition-colors hover:bg-[#f7f7fa] sm:px-6 md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_150px_auto]">
                    <IconCircle image={j.coverUrl} tone="violet" size={46}>
                      <span className="text-[15px] font-semibold">{j.address.replace(/^\d+\s*/, "")[0]}</span>
                    </IconCircle>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15.5px] font-medium">{j.address}</span>
                        {j.disputed && <Pill tone="red">Disputed</Pill>}
                      </div>
                      <div className="truncate text-[13px] text-muted">
                        {j.side === "tradesperson" ? `You're the tradesperson · for ${j.otherParty}` : `You're the homeowner · ${j.otherParty}`}
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <Pill tone={s.tone}>{s.label}</Pill>
                    </div>
                    <div className="hidden md:block">
                      {j.status === "DRAFT" ? (
                        <span className="text-[12.5px] text-faint">Scope not sent</span>
                      ) : (
                        <>
                          <Progress value={base ? (j.releasedCents / base) * 100 : 0} />
                          <div className="mt-1.5 text-[12px] text-faint">
                            {j.paid} of {j.lines} lines paid
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <div>
                        <div className="text-[15px] font-semibold tabular-nums">{money(j.releasedCents)}</div>
                        <div className="text-[12px] tabular-nums text-faint">of {money(base)}</div>
                      </div>
                      <IconChevron className="hidden h-4 w-4 text-faint md:block" />
                    </div>
                    <div className="col-span-3 flex items-center gap-2 pl-[60px] md:hidden">
                      <Pill tone={s.tone}>{s.label}</Pill>
                      {j.status !== "DRAFT" && <Progress value={base ? (j.releasedCents / base) * 100 : 0} className="flex-1" />}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
