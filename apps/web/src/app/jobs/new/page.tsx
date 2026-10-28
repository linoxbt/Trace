import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { NewJobForm } from "@/components/new-job-form";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "New job" };

export default async function NewJob() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/jobs/new");
  if (user.anonymous) redirect("/jobs");
  return (
    <AppShell email={user.email} back={{ href: "/jobs", label: "Jobs" }}>
      <NewJobForm />
    </AppShell>
  );
}
