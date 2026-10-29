import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { IconDispute } from "@/components/app/icons";
import { Card, Empty, IconCircle, PageTitle, Row } from "@/components/app/ui";
import { when } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { DISPUTE_REASON, disputesOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disputes" };

export default async function Disputes() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/disputes");
  const disputes = await disputesOf(user.id);
  return (
    <AppShell user={user}>
      <PageTitle title="Disputes" sub="PayPal disputes on your jobs. The photos, checks and approvals are already on record as evidence." />
      <Card className="mt-6 overflow-hidden">
        {disputes.length === 0 ? (
          <Empty icon={<IconDispute />} title="No disputes" body="If a client opens a PayPal dispute, it appears here with the evidence Trace has already collected." />
        ) : (
          <div className="divide-y divide-[#f0f0f4] py-1">
            {disputes.map((d) => (
              <Row
                key={d.id}
                href={`/disputes/${d.id}`}
                icon={
                  <IconCircle tone="red" size={42}>
                    <IconDispute className="h-5 w-5" />
                  </IconCircle>
                }
                title={DISPUTE_REASON[d.reason ?? ""] ?? d.reason ?? "Dispute"}
                sub={`${d.address} · ${d.paypalId} · opened ${when(d.createdAt)}`}
                value={d.filedAt ? "Evidence filed" : "Open"}
                valueTone={d.filedAt ? "green" : "red"}
                meta={(d.status ?? "").replace(/_/g, " ").toLowerCase() || undefined}
              />
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
