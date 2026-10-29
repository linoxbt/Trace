import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Empty, PageHeader } from "@/components/app/shell";
import { IconDispute } from "@/components/app/icons";
import { when } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { DISPUTE_REASON as REASON, disputesOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disputes" };


export default async function Disputes() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/disputes");
  const disputes = await disputesOf(user.id);
  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Disputes"
        title="If anyone disputes, the proof is ready."
        body="PayPal disputes on your jobs. Every line's photos, the checks, the verdicts and the homeowner's own approvals are already on record for the evidence pack."
      />
      <section className="rise surface mt-8 overflow-hidden rounded-[24px]" style={{ "--delay": "80ms" } as React.CSSProperties}>
        {disputes.length === 0 ? (
          <Empty icon={<IconDispute />} title="No disputes" body="If a homeowner opens a PayPal dispute on a release, it appears here with the evidence Trace has already collected." />
        ) : (
          <ul className="divide-y divide-line">
            {disputes.map((d) => (
              <li key={d.id}>
                <Link href={`/jobs/${d.jobId}`} className="flex items-center gap-4 px-5 py-4 hover:bg-paper sm:px-6">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bad-soft text-bad">
                    <IconDispute />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">
                      {REASON[d.reason ?? ""] ?? d.reason ?? "Dispute"} · {d.address}
                    </div>
                    <div className="num truncate text-[12px] text-faint">
                      {d.paypalId} · opened {when(d.createdAt)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${d.filedAt ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                    {d.filedAt ? "Evidence filed" : (d.status ?? "Open").replace(/_/g, " ").toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
