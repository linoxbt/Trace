import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { IconJobs, IconPlus } from "@/components/app/icons";
import { JobsTable } from "@/components/app/jobs-table";
import { Card, Empty, PageTitle, PrimaryButton } from "@/components/app/ui";
import { currentUser } from "@/server/auth";
import { invitesFor, jobsOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs" };

export default async function Jobs() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/jobs");
  const [jobs, invites] = await Promise.all([jobsOf(user.id), invitesFor(user.email)]);
  const newJob = !user.anonymous && (
    <PrimaryButton href="/jobs/new">
      <IconPlus /> New job
    </PrimaryButton>
  );
  return (
    <AppShell user={user}>
      <PageTitle title="Jobs" sub="Jobs you're doing and jobs you're paying for." actions={<span className="sm:hidden">{newJob}</span>} />
      <div className="mt-6">
        {jobs.length || invites.length ? (
          <JobsTable jobs={jobs} invites={invites} />
        ) : (
          <Card>
            <Empty icon={<IconJobs />} title={user.anonymous ? "Sign in to start a job" : "No jobs yet"} body="Tradespeople start a job and invite the homeowner by email. A scope sent to your email appears here." action={newJob} />
          </Card>
        )}
      </div>
    </AppShell>
  );
}
