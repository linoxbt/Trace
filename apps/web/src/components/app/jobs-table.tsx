"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Invite, JobRowView } from "@/server/app-data";
import { StatusChip } from "@/components/status";
import { money, when } from "@/lib/format";
import { IconMail } from "./icons";

const TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active", match: ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"] },
  { id: "approval", label: "Awaiting approval", match: ["DRAFT", "AWAITING_APPROVAL"] },
  { id: "done", label: "Finished", match: ["COMPLETED", "CLOSED_VOIDED"] },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function JobsTable({ jobs, invites }: { jobs: JobRowView[]; invites: Invite[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [side, setSide] = useState<"any" | "tradesperson" | "homeowner">("any");
  const [q, setQ] = useState("");
  const count = (t: (typeof TABS)[number]) => jobs.filter((j) => !("match" in t) || (t.match as readonly string[]).includes(j.status)).length;
  const shown = useMemo(() => {
    const t = TABS.find((x) => x.id === tab)!;
    const needle = q.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (!("match" in t) || (t.match as readonly string[]).includes(j.status)) &&
        (side === "any" || j.side === side) &&
        (!needle || j.address.toLowerCase().includes(needle) || j.otherParty.toLowerCase().includes(needle)),
    );
  }, [jobs, tab, side, q]);

  return (
    <div>
      {invites.length > 0 && (
        <section className="rise mb-6 overflow-hidden rounded-[24px] bg-violet-soft p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-violet">
            <IconMail className="h-[18px] w-[18px]" /> Sent to you
          </div>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {invites.map((i) => (
              <li key={i.id}>
                <Link href={`/jobs/${i.id}`} className="press flex items-center justify-between gap-4 rounded-2xl bg-card p-4 hover:shadow-md">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">{i.address}</div>
                    <div className="truncate text-[12.5px] text-muted">
                      {i.from} · {i.lines} line{i.lines === 1 ? "" : "s"} · {when(i.sentAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num text-[15px] font-semibold">{money(i.totalCents)}</div>
                    <div className="text-[12px] font-medium text-violet">Review →</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Job status" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`press h-10 shrink-0 rounded-full px-4 text-[13.5px] font-medium ${tab === t.id ? "bg-ink text-white" : "text-ink-2 hover:bg-card"}`}
            >
              {t.label} <span className={`num ml-1 ${tab === t.id ? "text-white/60" : "text-faint"}`}>{count(t)}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={side} onChange={(e) => setSide(e.target.value as typeof side)} className="field h-10 w-auto py-0 pr-9 text-[13.5px]" aria-label="Your role">
            <option value="any">Any role</option>
            <option value="tradesperson">As tradesperson</option>
            <option value="homeowner">As homeowner</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address or person" className="field h-10 w-full py-0 text-[13.5px] lg:w-64" aria-label="Search jobs" />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="surface mt-4 rounded-[24px] px-6 py-14 text-center text-[14px] text-muted">No jobs match.</div>
      ) : (
        <>
          {/* Desktop: a table */}
          <div className="surface mt-4 hidden overflow-hidden rounded-[24px] md:block">
            <table className="w-full table-fixed text-left text-[14px]">
              <colgroup>
                <col />
                <col className="w-[150px]" />
                <col className="w-[170px] xl:w-[200px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="hidden w-[150px] xl:table-column" />
              </colgroup>
              <thead>
                <tr className="border-b border-line text-[12px] font-medium uppercase tracking-[0.06em] text-faint">
                  <th className="px-5 py-3.5 font-medium">Job</th>
                  <th className="px-3 py-3.5 font-medium">Status</th>
                  <th className="px-3 py-3.5 font-medium">Progress</th>
                  <th className="px-3 py-3.5 text-right font-medium">Total</th>
                  <th className="px-3 py-3.5 text-right font-medium">Released</th>
                  <th className="hidden px-5 py-3.5 text-right font-medium xl:table-cell">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((j) => {
                  const base = j.heldCents || j.totalCents;
                  const pct = base ? Math.min(100, (j.releasedCents / base) * 100) : 0;
                  return (
                    <tr key={j.id} className="group cursor-pointer hover:bg-paper">
                      <td className="px-5 py-4">
                        <Link href={`/jobs/${j.id}`} className="block">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold group-hover:text-violet">{j.address}</span>
                            {j.demo && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10.5px] font-medium text-warn">Demo</span>}
                            {j.disputed && <span className="shrink-0 rounded-full bg-bad-soft px-2 py-0.5 text-[10.5px] font-medium text-bad">Disputed</span>}
                          </div>
                          <div className="mt-0.5 truncate text-[12.5px] text-muted">
                            {j.side === "tradesperson" ? "You're the tradesperson" : "You're the homeowner"} · {j.side === "tradesperson" ? `for ${j.otherParty}` : `by ${j.otherParty}`}
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-4">
                        <StatusChip status={j.status} size="sm" />
                      </td>
                      <td className="px-3 py-4">
                        {j.status === "DRAFT" ? (
                          <span className="text-[12.5px] text-faint">Scope not sent yet</span>
                        ) : (
                          <>
                            <div className="h-1.5 overflow-hidden rounded-full bg-paper-2">
                              <div className="h-full rounded-full bg-gradient-to-r from-violet to-[#8a63ff]" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="mt-1.5 text-[11.5px] text-faint">
                              {j.paid} of {j.lines} lines paid
                            </div>
                          </>
                        )}
                      </td>
                      <td className="num px-3 py-4 text-right font-semibold">{money(j.totalCents)}</td>
                      <td className="num px-3 py-4 text-right text-violet">{money(j.releasedCents)}</td>
                      <td className="num hidden px-5 py-4 text-right text-[12.5px] text-muted xl:table-cell">{when(j.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phones: cards */}
          <ul className="mt-4 flex flex-col gap-3 md:hidden">
            {shown.map((j) => {
              const base = j.heldCents || j.totalCents;
              const pct = base ? Math.min(100, (j.releasedCents / base) * 100) : 0;
              return (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="surface block rounded-[22px] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[16px] font-semibold">{j.address}</div>
                        <div className="mt-0.5 truncate text-[12.5px] text-muted">{j.side === "tradesperson" ? `For ${j.otherParty}` : `By ${j.otherParty}`}</div>
                      </div>
                      <StatusChip status={j.status} size="sm" />
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-2">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet to-[#8a63ff]" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[12.5px]">
                      <span className="text-faint">{j.status === "DRAFT" ? "Scope not sent yet" : `${j.paid} of ${j.lines} lines paid`}</span>
                      <span className="num">
                        <span className="text-violet">{money(j.releasedCents)}</span> <span className="text-faint">of</span> {money(j.totalCents)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
