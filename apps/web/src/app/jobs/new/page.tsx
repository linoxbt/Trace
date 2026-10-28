import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { NewJobForm } from "@/components/new-job-form";

export const dynamic = "force-dynamic";

export default async function NewJob() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/jobs/new");
  if (user.anonymous) redirect("/jobs");
  return <NewJobForm />;
}
