import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Clause, Empty } from "@/components/app/shell";
import { IconArrow, IconInbox, IconJobs, IconPlus } from "@/components/app/icons";
import { InboxTickets } from "@/components/app/inbox";
import { ActivityList } from "@/components/app/activity";
import { JobCard } from "@/components/app/job-card";
import { ProofStrip, StripLegend } from "@/components/app/proof-strip";
import { ShieldIcon } from "@/components/guard";
import { money } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { activityOf, guardSummaryOf, inboxOf, jobsOf, profileOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

function greeting(): string {
  const h = new Date().getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  const [profile, jobs, inbox, activity, guard] = await Promise.all([profileOf(user.id), jobsOf(user.id), inboxOf(user.id, user.email), activityOf(user.id, 7), guardSummaryOf(user.id)]);

  const live = jobs.filter((j) => !["COMPLETED", "CLOSED_VOIDED"].includes(j.status));
  const held = live.filter((j) => j.status !== "DRAFT").reduce((n, j) => n + Math.max(0, j.heldCents - j.releasedCents), 0);
  const released = jobs.reduce((n, j) => n + j.releasedCents, 0);
  const earned = jobs.filter((j) => j.side === "tradesperson").reduce((n, j) => n + j.releasedCents, 0);
  const paid = jobs.filter((j) => j.side === "homeowner").reduce((n, j) => n + j.releasedCents, 0);
  const board = live.filter((j) => j.strip.length).slice(0, 4);
  const decided = guard.allowed + guard.asked + guard.blocked;

  return (
    <AppShell user={user}>
      {/* The ledger: today's money, every live job as a proof strip. */}
      <section className="rise stage grain relative overflow-hidden rounded-[32px] p-6 text-white sm:p-8 lg:p-10">
        <div className="gridlines-dark pointer-events-none absolute inset-0" />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
          <div className="min-w-0">
            <p className="eyebrow eyebrow-dark">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
            <h1 className="display mt-4 text-[40px] leading-[0.96] sm:text-[56px]">
              {greeting()},<br />
              <span className="text-lilac">{profile.displayName}.</span>
            </h1>
            <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 sm:gap-6">
              <div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">Held, not charged</div>
                <div className="num mt-1.5 text-[24px] font-semibold tracking-tight sm:text-[38px]">{money(held)}</div>
              </div>
              <div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">Released for proved work</div>
                <div className="num mt-1.5 text-[24px] font-semibold tracking-tight text-lilac sm:text-[38px]">{money(released)}</div>
                {earned > 0 && paid > 0 && (
                  <div className="num mt-1 text-[12px] text-white/50">
                    {money(earned)} in · {money(paid)} out
                  </div>
                )}
              </div>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {!user.anonymous && (
                <Link href="/jobs/new" className="press inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-ink hover:bg-violet-soft">
                  <IconPlus /> New job
                </Link>
              )}
              <Link href="/payments" className="press inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-[14px] font-medium hover:bg-white/10">
                Statement <IconArrow className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="relative min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">Live jobs, line by line</span>
              {inbox.length > 0 && (
                <Link href="/approvals" className="stamp text-lilac hover:text-white">
                  {inbox.length} waiting on you
                </Link>
              )}
            </div>
            {board.length ? (
              <ul className="mt-5 space-y-5">
                {board.map((j) => (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="group block">
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[15px] font-semibold group-hover:text-lilac">{j.address}</span>
                        <span className="num shrink-0 text-[12.5px] text-white/55">
                          <span className="text-lilac">{money(j.releasedCents)}</span> / {money(j.heldCents || j.totalCents)}
                        </span>
                      </div>
                      <ProofStrip lines={j.strip} size="lg" dark labels />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5 rounded-[20px] border border-dashed border-white/15 p-6 text-[14px] text-white/55">
                No live jobs yet. Each job you start or are sent shows up here as a strip of its lines: solid when paid, outlined while held.
              </div>
            )}
            <StripLegend dark className="mt-6" />
          </div>
        </div>
      </section>

      {/* What needs you */}
      <section className="rise mt-10" style={{ "--delay": "80ms" } as React.CSSProperties}>
        <Clause
          action={
            inbox.length > 6 && (
              <Link href="/approvals" className="font-mono text-[11px] uppercase tracking-[0.12em] text-violet">
                All {inbox.length} →
              </Link>
            )
          }
        >
          Waiting on you · {inbox.length}
        </Clause>
        {inbox.length ? (
          <InboxTickets items={inbox.slice(0, 6)} />
        ) : (
          <div className="clay rounded-[24px]">
            <Empty icon={<IconInbox />} title="You're all caught up" body="Scopes to approve, lines to review or prove, and anything the money guard asks you about land here." />
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rise min-w-0" style={{ "--delay": "120ms" } as React.CSSProperties}>
          <Clause
            action={
              <Link href="/jobs" className="font-mono text-[11px] uppercase tracking-[0.12em] text-violet">
                All jobs →
              </Link>
            }
          >
            On the job · {live.length}
          </Clause>
          {live.length ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {live.slice(0, 4).map((j, i) => (
                <JobCard key={j.id} job={j} priority={i < 2} />
              ))}
            </div>
          ) : (
            <div className="clay rounded-[24px]">
              <Empty
                icon={<IconJobs />}
                title={user.anonymous ? "Sign in with your email to start a job" : "No live jobs"}
                body="Tradespeople start a job and invite the homeowner by email. Homeowners see a job here as soon as a scope is sent to them."
              />
            </div>
          )}
        </section>

        <aside className="rise flex flex-col gap-8" style={{ "--delay": "160ms" } as React.CSSProperties}>
          <div>
            <Clause>Money guard</Clause>
            <Link href="/rules" className="clay clay-hover block rounded-[24px] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Inspection record</div>
                  <div className="mt-1 text-[17px] font-semibold tracking-tight">Every move checked first</div>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-soft text-violet">
                  <ShieldIcon className="h-5 w-5" />
                </span>
              </div>
              <dl className="mt-5 divide-y divide-dashed divide-line-2 border-y border-dashed border-line-2 font-mono text-[12.5px]">
                {[
                  ["Allowed", guard.allowed, "text-ok"],
                  ["Asked first", guard.asked, "text-warn"],
                  ["Blocked", guard.blocked, "text-bad"],
                  ["Your own rules", guard.rules, "text-violet"],
                ].map(([k, v, cls]) => (
                  <div key={k as string} className="flex items-center justify-between py-2.5">
                    <dt className="uppercase tracking-[0.1em] text-muted">{k}</dt>
                    <dd className={`text-[15px] font-semibold ${cls}`}>{String(v).padStart(2, "0")}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                {decided ? `${decided} money move${decided === 1 ? "" : "s"} checked against live PayPal state.` : "Releases are checked against live PayPal state and your rules first."}
              </p>
            </Link>
          </div>
          <div>
            <Clause
              action={
                <Link href="/activity" className="font-mono text-[11px] uppercase tracking-[0.12em] text-violet">
                  Log →
                </Link>
              }
            >
              Latest
            </Clause>
            <div className="clay rounded-[24px] p-5">{activity.length ? <ActivityList items={activity} compact /> : <p className="text-[14px] text-muted">Activity on your jobs shows up here.</p>}</div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
