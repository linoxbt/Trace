import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { IconActivity, IconInbox, IconJobs, IconPlus, IconShield, IconWallet } from "@/components/app/icons";
import { InboxRows } from "@/components/app/inbox";
import { ActivityRows } from "@/components/app/activity";
import { BigMoney, Card, CardHead, Empty, IconCircle, Progress, QuickAction, SeeAll } from "@/components/app/ui";
import { money } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { activityOf, guardSummaryOf, inboxOf, jobsOf, profileOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

const STATUS: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting approval",
  AUTHORIZED: "Money held",
  IN_PROGRESS: "In progress",
  PARTIALLY_RELEASED: "Part released",
  COMPLETED: "Completed",
  CLOSED_VOIDED: "Closed",
};

function greeting(): string {
  const h = new Date().getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  const [profile, jobs, inbox, activity, guard] = await Promise.all([profileOf(user.id), jobsOf(user.id), inboxOf(user.id, user.email), activityOf(user.id, 8), guardSummaryOf(user.id)]);

  const live = jobs.filter((j) => !["COMPLETED", "CLOSED_VOIDED"].includes(j.status));
  const held = live.filter((j) => j.status !== "DRAFT").reduce((n, j) => n + Math.max(0, j.heldCents - j.releasedCents), 0);
  const earned = jobs.filter((j) => j.side === "tradesperson").reduce((n, j) => n + j.releasedCents, 0);
  const paid = jobs.filter((j) => j.side === "homeowner").reduce((n, j) => n + j.releasedCents, 0);
  const holding = live.filter((j) => j.heldCents > j.releasedCents).length;
  const checked = guard.allowed + guard.asked + guard.blocked;

  return (
    <AppShell user={user}>
      <p className="text-[15px] text-muted">
        {greeting()}, <span className="font-medium text-ink">{profile.displayName}</span>
      </p>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Balance */}
          <Card className="p-6 sm:p-8">
            <div className="text-[14px] font-medium text-muted">Held now</div>
            <BigMoney cents={held} className="mt-1 block text-[46px] font-semibold leading-none sm:text-[58px]" />
            <p className="mt-3 text-[14px] text-muted">
              On PayPal {holding === 1 ? "hold" : "holds"} across {holding} job{holding === 1 ? "" : "s"}. Not charged until work is proved.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-ok-soft px-3 py-1.5 text-[13px] font-medium text-ok">
                Paid to you <span className="tabular-nums">{money(earned)}</span>
              </span>
              <span className="rounded-full bg-[#f1f1f5] px-3 py-1.5 text-[13px] font-medium text-ink-2">
                Paid by you <span className="tabular-nums">{money(paid)}</span>
              </span>
            </div>
            <div className="mt-7 grid grid-cols-5 gap-1 border-t border-[#f0f0f4] pt-6 sm:flex sm:gap-x-6">
              {!user.anonymous && <QuickAction href="/jobs/new" icon={<IconPlus className="h-5 w-5" />} label="New job" />}
              <QuickAction href="/approvals" icon={<IconInbox className="h-[22px] w-[22px]" />} label="To do" badge={inbox.length} />
              <QuickAction href="/payments" icon={<IconWallet className="h-[22px] w-[22px]" />} label="Payments" />
              <QuickAction href="/jobs" icon={<IconJobs className="h-[22px] w-[22px]" />} label="Jobs" />
              <QuickAction href="/rules" icon={<IconShield className="h-[22px] w-[22px]" />} label="Rules" />
            </div>
          </Card>

          {/* To do */}
          <Card className="overflow-hidden">
            <CardHead title="To do" sub={inbox.length ? `${inbox.length} thing${inbox.length === 1 ? "" : "s"} waiting on you` : undefined} action={inbox.length > 5 && <SeeAll href="/approvals" />} />
            {inbox.length ? <InboxRows items={inbox.slice(0, 5)} /> : <Empty icon={<IconInbox />} title="You're all caught up" body="Scopes to approve, lines to review or prove, and anything the money guard asks you about appear here." />}
          </Card>

          {/* Activity */}
          <Card className="overflow-hidden">
            <CardHead title="Recent activity" action={<SeeAll href="/activity" />} />
            {activity.length ? <ActivityRows items={activity} /> : <Empty icon={<IconActivity />} title="No activity yet" body="Holds, photos, checks and payments on your jobs appear here." />}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {/* Jobs, like accounts */}
          <Card className="overflow-hidden">
            <CardHead title="Your jobs" action={<SeeAll href="/jobs" />} />
            {live.length ? (
              <ul className="pb-2">
                {live.slice(0, 6).map((j) => {
                  const base = j.heldCents || j.totalCents;
                  return (
                    <li key={j.id}>
                      <Link href={`/jobs/${j.id}`} className="block px-5 py-3 transition-colors hover:bg-[#f7f7fa] sm:px-6">
                        <div className="flex items-center gap-3">
                          <IconCircle image={j.coverUrl} tone="violet" size={40}>
                            <span className="text-[14px] font-semibold">{j.address.replace(/^\d+\s*/, "")[0]}</span>
                          </IconCircle>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14.5px] font-medium">{j.address}</div>
                            <div className="truncate text-[12.5px] text-muted">{STATUS[j.status] ?? j.status}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[14.5px] font-semibold tabular-nums">{money(j.releasedCents)}</div>
                            <div className="text-[12px] tabular-nums text-faint">of {money(base)}</div>
                          </div>
                        </div>
                        {j.status !== "DRAFT" && <Progress value={base ? (j.releasedCents / base) * 100 : 0} className="ml-[52px] mt-2.5" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty
                icon={<IconJobs />}
                title={user.anonymous ? "Sign in to start a job" : "No jobs yet"}
                body="Start a job and invite the homeowner, or open a scope sent to your email."
                action={
                  !user.anonymous && (
                    <Link href="/jobs/new" className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-violet px-4 text-[14px] font-semibold text-white">
                      <IconPlus /> New job
                    </Link>
                  )
                }
              />
            )}
          </Card>

          {/* The guard */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-3.5">
              <IconCircle tone="violet" size={42}>
                <IconShield className="h-5 w-5" />
              </IconCircle>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">Every payment is checked first</div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                  {checked
                    ? `${checked} money move${checked === 1 ? " was" : "s were"} checked against PayPal and your rules before anything moved.`
                    : "Before any money moves, Trace checks PayPal and your rules."}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-[#e6e6ec] rounded-2xl bg-[#f7f7fa] py-3 text-center">
              <Stat n={guard.allowed} label="Allowed" cls="text-ok" />
              <Stat n={guard.asked} label="Asked you" cls="text-warn" />
              <Stat n={guard.blocked} label="Blocked" cls="text-bad" />
            </div>
            <Link href="/rules" className="mt-4 inline-block text-[13.5px] font-medium text-violet">
              {guard.rules ? `${guard.rules} rule${guard.rules === 1 ? "" : "s"} of your own` : "Add a rule in your own words"} →
            </Link>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div>
      <div className={`text-[20px] font-semibold tabular-nums ${cls}`}>{n}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}
