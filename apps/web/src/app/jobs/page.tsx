import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { StatusChip } from "@/components/status";
import { money, when } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { myJobs } from "@/server/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your jobs" };

export default async function Jobs() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/jobs");
  const jobs = await myJobs(user.id);
  const held = jobs.reduce((n, j) => n + Math.max(0, j.heldCents - j.releasedCents), 0);
  const released = jobs.reduce((n, j) => n + j.releasedCents, 0);

  return (
    <AppShell email={user.email}>
      <div className="rise flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-violet">Your jobs</p>
          <h1 className="display mt-1 text-[40px] leading-[1] sm:text-[52px]">
            {jobs.length ? "Everything in one place." : "Nothing here yet."}
          </h1>
        </div>
        {!user.anonymous && (
          <Link href="/jobs/new" className="press btn-primary inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium">
            <span className="text-[18px] leading-none">+</span> New job
          </Link>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="rise mt-8 grid grid-cols-2 gap-3" style={{ "--delay": "80ms" } as React.CSSProperties}>
          <div className="surface rounded-2xl p-4">
            <div className="text-[12px] text-muted">Held now</div>
            <div className="num mt-1 text-[22px] font-semibold tracking-tight">{money(held)}</div>
          </div>
          <div className="surface rounded-2xl p-4">
            <div className="text-[12px] text-muted">Released so far</div>
            <div className="num mt-1 text-[22px] font-semibold tracking-tight text-violet">{money(released)}</div>
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="rise surface mt-10 rounded-[28px] p-8 text-center sm:p-12" style={{ "--delay": "100ms" } as React.CSSProperties}>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-soft text-violet">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M7 4v4H3M17 4v4h4M21 16h-4v4M3 16h4v4" />
            </svg>
          </div>
          <h2 className="mt-5 text-[20px] font-semibold tracking-tight">
            {user.anonymous ? "Sign in with your email to start a job" : "Start your first job"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            Tradespeople start a job and invite the homeowner by email. Homeowners: your job appears here once you open the link you were sent.
          </p>
          {!user.anonymous && (
            <Link href="/jobs/new" className="press btn-ink mt-6 inline-flex h-11 items-center rounded-full px-5 text-[14px] font-medium">
              Start a job
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {jobs.map((j, i) => {
            const base = j.heldCents || j.totalCents;
            const pct = base ? (j.releasedCents / base) * 100 : 0;
            return (
              <li key={j.id} className="rise" style={{ "--delay": `${120 + i * 50}ms` } as React.CSSProperties}>
                <Link href={`/jobs/${j.id}`} className="surface group block rounded-[22px] p-5 transition-transform duration-500 hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-[17px] font-semibold tracking-tight">{j.address}</div>
                      <div className="mt-1 text-[13px] text-muted">
                        {j.role === "tradesperson" ? "You're the tradesperson" : "You're the homeowner"} · <span className="num">{when(j.createdAt)}</span>
                      </div>
                    </div>
                    <StatusChip status={j.status} />
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-4">
                    <div className="flex-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-paper-2">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet to-[#8a63ff]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-2 text-[12px] text-faint">
                        {j.paid} of {j.lines} lines paid
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-[17px] font-semibold">{money(j.totalCents)}</div>
                      <div className="num text-[12px] text-violet">{money(j.releasedCents)} released</div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
