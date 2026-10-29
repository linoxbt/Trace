import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Empty, PageHeader, Panel } from "@/components/app/shell";
import { IconArrow, IconInbox, IconJobs, IconPlus, IconShield } from "@/components/app/icons";
import { InboxList } from "@/components/app/inbox";
import { ActivityList } from "@/components/app/activity";
import { StatusChip } from "@/components/status";
import { money } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { activityOf, guardSummaryOf, inboxOf, jobsOf, profileOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const ACTIVE = ["AWAITING_APPROVAL", "AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED", "DRAFT"];

function greeting(): string {
  const h = new Date().getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  const [profile, jobs, inbox, activity, guard] = await Promise.all([profileOf(user.id), jobsOf(user.id), inboxOf(user.id, user.email), activityOf(user.id, 8), guardSummaryOf(user.id)]);

  const live = jobs.filter((j) => !["COMPLETED", "CLOSED_VOIDED"].includes(j.status));
  const held = live.reduce((n, j) => n + Math.max(0, j.heldCents - j.releasedCents), 0);
  const released = jobs.reduce((n, j) => n + j.releasedCents, 0);
  const earning = jobs.filter((j) => j.side === "tradesperson").reduce((n, j) => n + j.releasedCents, 0);
  const paying = jobs.filter((j) => j.side === "homeowner").reduce((n, j) => n + j.releasedCents, 0);
  const totalHeld = held + released;
  const decided = guard.allowed + guard.asked + guard.blocked;

  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={
          <>
            {greeting()}, <span className="text-violet">{profile.displayName}.</span>
          </>
        }
        body={inbox.length ? `${inbox.length} thing${inbox.length === 1 ? " is" : "s are"} waiting on you.` : "Nothing is waiting on you right now."}
        actions={
          !user.anonymous && (
            <Link href="/jobs/new" className="press btn-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium lg:hidden">
              <IconPlus /> New job
            </Link>
          )
        }
      />

      <div className="rise mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" style={{ "--delay": "60ms" } as React.CSSProperties}>
        <Stat label="Held now" value={money(held)} note="On PayPal holds, not charged" tone="ink" />
        <Stat label="Released" value={money(released)} note={earning && paying ? `${money(earning)} earned · ${money(paying)} paid` : earning ? "Paid to you" : paying ? "Paid by you" : "Nothing released yet"} tone="violet" />
        <Stat label="Waiting on you" value={String(inbox.length)} note={inbox.length ? "See the list below" : "All clear"} tone={inbox.length ? "warn" : "ok"} />
        <Stat label="Active jobs" value={String(live.length)} note={`${jobs.length} job${jobs.length === 1 ? "" : "s"} in total`} tone="ink" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title="Waiting on you"
            action={
              inbox.length > 5 && (
                <Link href="/approvals" className="text-[13px] font-medium text-violet">
                  See all {inbox.length}
                </Link>
              )
            }
          >
            {inbox.length ? <InboxList items={inbox.slice(0, 5)} /> : <Empty icon={<IconInbox />} title="You're all caught up" body="Scopes to approve, lines to review or prove, and anything the guard asks you about show up here." />}
          </Panel>

          <Panel
            title="Active jobs"
            action={
              <Link href="/jobs" className="inline-flex items-center gap-1 text-[13px] font-medium text-violet">
                All jobs <IconArrow className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {live.length === 0 ? (
              <Empty
                icon={<IconJobs />}
                title={user.anonymous ? "Sign in with your email to start a job" : "No active jobs"}
                body="Tradespeople start a job and invite the homeowner by email. Homeowners see jobs here as soon as a scope is sent to them."
                action={
                  !user.anonymous && (
                    <Link href="/jobs/new" className="press btn-ink inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium">
                      <IconPlus /> Start a job
                    </Link>
                  )
                }
              />
            ) : (
              <ul className="-mx-2 divide-y divide-line">
                {live.slice(0, 6).map((j) => {
                  const base = j.heldCents || j.totalCents;
                  const pct = base ? Math.min(100, (j.releasedCents / base) * 100) : 0;
                  return (
                    <li key={j.id}>
                      <Link href={`/jobs/${j.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl px-2 py-3.5 hover:bg-paper sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-semibold">{j.address}</div>
                          <div className="mt-0.5 truncate text-[12.5px] text-muted">
                            {j.side === "tradesperson" ? `For ${j.otherParty}` : `By ${j.otherParty}`} · {j.status === "DRAFT" ? "scope not sent yet" : `${j.paid} of ${j.lines} lines paid`}
                          </div>
                        </div>
                        <div className={`hidden sm:block ${j.status === "DRAFT" ? "invisible" : ""}`}>
                          <div className="h-1.5 overflow-hidden rounded-full bg-paper-2">
                            <div className="h-full rounded-full bg-gradient-to-r from-violet to-[#8a63ff]" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="num mt-1.5 text-[11.5px] text-faint">
                            {money(j.releasedCents)} of {money(base)}
                          </div>
                        </div>
                        <StatusChip status={j.status} size="sm" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <section className="grain relative overflow-hidden rounded-[24px] bg-night p-6 text-white">
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[radial-gradient(closest-side,rgba(91,47,214,0.6),transparent)] blur-xl" />
            <div className="relative">
              <div className="text-[12px] uppercase tracking-[0.14em] text-white/50">Across your jobs</div>
              <div className="num mt-2 text-[34px] font-semibold tracking-tight">{money(totalHeld)}</div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[#8a63ff] to-lilac" style={{ width: `${totalHeld ? (released / totalHeld) * 100 : 0}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-[12.5px]">
                <span className="text-lilac">
                  Released <span className="num font-semibold">{money(released)}</span>
                </span>
                <span className="text-white/60">
                  Still held <span className="num font-semibold text-white">{money(held)}</span>
                </span>
              </div>
              <Link href="/payments" className="press mt-5 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] font-medium hover:bg-white/15">
                Payments ledger <IconArrow className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <Panel
            title={
              <span className="flex items-center gap-2">
                <IconShield className="h-[18px] w-[18px] text-violet" /> Money guard
              </span>
            }
            action={
              <Link href="/rules" className="text-[13px] font-medium text-violet">
                Rules
              </Link>
            }
          >
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini n={guard.allowed} label="Allowed" cls="text-ok" />
              <Mini n={guard.asked} label="Asked you" cls="text-warn" />
              <Mini n={guard.blocked} label="Blocked" cls="text-bad" />
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              {decided ? `${decided} money move${decided === 1 ? " was" : "s were"} checked against live PayPal state before anything moved.` : "Every release is checked against live PayPal state and your rules before money moves."}{" "}
              {guard.rules ? `${guard.rules} rule${guard.rules === 1 ? "" : "s"} of your own on top.` : "Add a rule in your own words."}
            </p>
          </Panel>

          <Panel
            title="Recent activity"
            action={
              <Link href="/activity" className="text-[13px] font-medium text-violet">
                All
              </Link>
            }
          >
            {activity.length ? <ActivityList items={activity} compact /> : <p className="text-[14px] text-muted">Activity on your jobs shows up here.</p>}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone: "ink" | "violet" | "warn" | "ok" }) {
  const cls = { ink: "text-ink", violet: "text-violet", warn: "text-warn", ok: "text-ok" }[tone];
  return (
    <div className="surface rounded-[20px] p-4 sm:p-5">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={`num mt-1.5 text-[24px] font-semibold tracking-tight sm:text-[28px] ${cls}`}>{value}</div>
      <div className="mt-1 truncate text-[12px] text-faint">{note}</div>
    </div>
  );
}

function Mini({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className="rounded-2xl bg-paper px-2 py-3">
      <div className={`num text-[22px] font-semibold ${cls}`}>{n}</div>
      <div className="text-[11.5px] text-muted">{label}</div>
    </div>
  );
}
