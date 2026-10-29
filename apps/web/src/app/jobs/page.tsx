import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Empty, PageHeader } from "@/components/app/shell";
import { IconJobs, IconPlus } from "@/components/app/icons";
import { JobsTable } from "@/components/app/jobs-table";
import { currentUser } from "@/server/auth";
import { invitesFor, jobsOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs" };

export default async function Jobs() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/jobs");
  const [jobs, invites] = await Promise.all([jobsOf(user.id), invitesFor(user.email)]);
  const newJob = !user.anonymous && (
    <Link href="/jobs/new" className="press btn-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium lg:hidden">
      <IconPlus /> New job
    </Link>
  );

  return (
    <AppShell user={user}>
      <PageHeader eyebrow="Jobs" title="Every job, line by line." body="Jobs you're doing as a tradesperson and jobs you're paying for as a homeowner, with what's held and what's been released." actions={newJob} />
      <div className="rise mt-8" style={{ "--delay": "80ms" } as React.CSSProperties}>
        {jobs.length || invites.length ? (
          <JobsTable jobs={jobs} invites={invites} />
        ) : (
          <div className="surface rounded-[24px]">
            <Empty
              icon={<IconJobs />}
              title={user.anonymous ? "Sign in with your email to start a job" : "Start your first job"}
              body="Tradespeople start a job and invite the homeowner by email. Homeowners: a scope sent to your email shows up here."
              action={newJob}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
