import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { jobView } from "@/server/view";
import { HttpError } from "@/server/http";
import { getJob } from "@trace/db";
import { engine } from "@/server/engine";
import { JobScreen } from "@/components/job-screen";
import { ClaimJob } from "@/components/claim-job";
import { AppShell } from "@/components/app/shell";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/jobs/${id}`);
  try {
    const view = await jobView(id, user.id);
    return (
      <AppShell user={user} back={{ href: "/jobs", label: "Jobs" }}>
        <JobScreen initial={view} paypalClientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""} bnCode={process.env.PAYPAL_BN_CODE ?? ""} sandbox={(process.env.PAYPAL_API_BASE ?? "sandbox").includes("sandbox")} />
      </AppShell>
    );
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 404) throw err;
    // Not a party yet: the invited homeowner opening the link for the first time.
    const job = await getJob(engine().db, id).catch(() => null);
    if (job && !job.homeowner_id && user.email && job.homeowner_email === user.email) return (
        <AppShell user={user} back={{ href: "/jobs", label: "Jobs" }} wide={false}>
          <ClaimJob jobId={id} address={job.address} />
        </AppShell>
      );
    notFound();
  }
}
