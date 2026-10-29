import { notFound, redirect } from "next/navigation";
import { disputeView, EngineError } from "@trace/engine";
import { mustGetJob } from "@trace/db";
import { AppShell } from "@/components/app/shell";
import { DisputeScreen } from "@/components/app/dispute-screen";
import { currentUser } from "@/server/auth";
import { DISPUTE_REASON } from "@/server/app-data";
import { engine } from "@/server/engine";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dispute" };

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/disputes/${id}`);
  const e = engine();
  const d = await disputeView(e, id, user.id).catch((err) => {
    if (err instanceof EngineError && err.status === 404) notFound();
    throw err;
  });
  const job = await mustGetJob(e.db, d.jobId);
  const amount = (
    await e.db.query<{ amount_cents: number }>("select c.amount_cents from disputes d join captures c on c.id = d.capture_id where d.id = $1", [id])
  ).rows[0]?.amount_cents ?? null;
  return (
    <AppShell user={user} back={{ href: "/disputes", label: "Disputes" }} wide={false}>
      <DisputeScreen
        initial={d}
        reasonLabel={DISPUTE_REASON[d.reason ?? ""] ?? d.reason ?? "Dispute"}
        address={job.address}
        amountCents={amount}
        demoMode={env().DEMO_MODE === "true"}
      />
    </AppShell>
  );
}
