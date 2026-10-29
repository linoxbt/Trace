import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { IconWallet } from "@/components/app/icons";
import { PaymentsList } from "@/components/app/payments-list";
import { BigMoney, Card, Empty, PageTitle } from "@/components/app/ui";
import { money } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { ledgerOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

const LANDED = ["COMPLETED", "PENDING"];

export default async function Payments() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/payments");
  const ledger = await ledgerOf(user.id);

  const released = ledger.filter((l) => l.kind === "release" && LANDED.includes(l.status));
  const earned = released.filter((l) => l.side === "tradesperson").reduce((n, l) => n + l.amountCents, 0);
  const paid = released.filter((l) => l.side === "homeowner").reduce((n, l) => n + l.amountCents, 0);
  const openHolds = ledger.filter((l) => l.kind === "hold" && (l.status === "CREATED" || l.status === "PARTIALLY_CAPTURED"));
  const heldNow = openHolds.reduce((n, h) => n + Math.max(0, h.amountCents - released.filter((r) => r.jobId === h.jobId).reduce((m, r) => m + r.amountCents, 0)), 0);

  return (
    <AppShell user={user}>
      <PageTitle title="Payments" sub="Every PayPal hold and payment on your jobs. Trace never holds the money itself." />
      <Card className="mt-6 p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:divide-x sm:divide-[#f0f0f4]">
          <div>
            <div className="text-[14px] font-medium text-muted">Held now</div>
            <BigMoney cents={heldNow} className="mt-1 block text-[40px] font-semibold leading-none sm:text-[46px]" />
            <div className="mt-2 text-[13px] text-muted">
              {openHolds.length} open hold{openHolds.length === 1 ? "" : "s"}, not charged
            </div>
          </div>
          <div className="sm:pl-6">
            <div className="text-[14px] font-medium text-muted">Paid to you</div>
            <div className="mt-1 text-[26px] font-semibold tabular-nums text-ok">{money(earned)}</div>
            <div className="mt-1 text-[13px] text-muted">Straight into your PayPal</div>
          </div>
          <div className="sm:pl-6">
            <div className="text-[14px] font-medium text-muted">Paid by you</div>
            <div className="mt-1 text-[26px] font-semibold tabular-nums">{money(paid)}</div>
            <div className="mt-1 text-[13px] text-muted">As homeowner</div>
          </div>
        </div>
      </Card>
      <div className="mt-6">
        {ledger.length ? (
          <PaymentsList ledger={ledger} />
        ) : (
          <Card>
            <Empty icon={<IconWallet />} title="No payments yet" body="When a homeowner approves a scope with PayPal, the hold appears here, then each payment as lines are proved." />
          </Card>
        )}
      </div>
    </AppShell>
  );
}
