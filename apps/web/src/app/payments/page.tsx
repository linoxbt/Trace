import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Empty, PageHeader } from "@/components/app/shell";
import { IconWallet } from "@/components/app/icons";
import { money, when } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { ledgerOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

const STATUS: Record<string, { label: string; cls: string }> = {
  CREATED: { label: "Held", cls: "bg-violet-soft text-violet" },
  PARTIALLY_CAPTURED: { label: "Part released", cls: "bg-violet-soft text-violet" },
  CAPTURED: { label: "Fully released", cls: "bg-ok-soft text-ok" },
  VOIDED: { label: "Released back", cls: "bg-paper-2 text-muted" },
  DENIED: { label: "Denied", cls: "bg-bad-soft text-bad" },
  PENDING: { label: "Pending", cls: "bg-warn-soft text-warn" },
  SENDING: { label: "Sending", cls: "bg-warn-soft text-warn" },
  COMPLETED: { label: "Paid", cls: "bg-ok-soft text-ok" },
  DECLINED: { label: "Declined", cls: "bg-bad-soft text-bad" },
  FAILED: { label: "Refused · not charged", cls: "bg-bad-soft text-bad" },
  REFUNDED: { label: "Refunded", cls: "bg-paper-2 text-muted" },
  PARTIALLY_REFUNDED: { label: "Part refunded", cls: "bg-paper-2 text-muted" },
};

export default async function Payments() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/payments");
  const ledger = await ledgerOf(user.id);
  const releases = ledger.filter((l) => l.kind === "release" && (l.status === "COMPLETED" || l.status === "PENDING"));
  const holds = ledger.filter((l) => l.kind === "hold");
  const earned = releases.filter((l) => l.side === "tradesperson").reduce((n, l) => n + l.amountCents, 0);
  const paid = releases.filter((l) => l.side === "homeowner").reduce((n, l) => n + l.amountCents, 0);
  const openHolds = holds.filter((h) => h.status === "CREATED" || h.status === "PARTIALLY_CAPTURED");
  const heldNow = openHolds.reduce((n, h) => n + h.amountCents, 0) - releases.filter((r) => openHolds.some((h) => h.jobId === r.jobId)).reduce((n, r) => n + r.amountCents, 0);

  return (
    <AppShell user={user}>
      <PageHeader eyebrow="Payments" title="Held, released, on record." body="Every PayPal hold and release on your jobs. Trace never holds the money: holds sit on the homeowner's PayPal account and releases go straight to the tradesperson's." />
      <div className="rise mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" style={{ "--delay": "60ms" } as React.CSSProperties}>
        <Tile label="Held now" value={money(Math.max(0, heldNow))} note={`${openHolds.length} open hold${openHolds.length === 1 ? "" : "s"}`} />
        <Tile label="Paid to you" value={money(earned)} note="As tradesperson" accent />
        <Tile label="Paid by you" value={money(paid)} note="As homeowner" />
        <Tile label="Releases" value={String(releases.length)} note="Each one checked by the guard" />
      </div>

      <section className="rise surface mt-6 overflow-hidden rounded-[24px]" style={{ "--delay": "120ms" } as React.CSSProperties}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
          <h2 className="text-[16px] font-semibold tracking-tight">Ledger</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">PayPal sandbox</span>
        </div>
        {ledger.length === 0 ? (
          <Empty icon={<IconWallet />} title="No payments yet" body="When a homeowner approves a scope with PayPal, the hold shows up here, then each release as lines are proved." />
        ) : (
          <ul className="divide-y divide-line">
            {ledger.map((l) => {
              const s = STATUS[l.status] ?? { label: l.status, cls: "bg-paper-2 text-muted" };
              const incoming = l.kind === "release" && l.side === "tradesperson";
              return (
                <li key={l.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:px-6 md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl text-[15px] ${l.kind === "hold" ? "bg-paper-2 text-ink-2" : "bg-violet-soft text-violet"}`} aria-hidden>
                    {l.kind === "hold" ? "◆" : "↗"}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] font-semibold">
                      {l.kind === "hold" ? "Hold placed" : l.final ? "Final release" : "Release"} · {l.address}
                    </div>
                    <div className="num truncate text-[12px] text-faint">
                      {when(l.at)}
                      {l.expiresAt && l.kind === "hold" ? ` · expires ${when(l.expiresAt)}` : ""}
                    </div>
                  </div>
                  <div className="hidden min-w-0 md:block">
                    <div className="num truncate text-[12px] text-muted">{l.paypalId ?? "awaiting PayPal"}</div>
                    <Link href={`/jobs/${l.jobId}`} className="text-[12px] font-medium text-violet">
                      Open job
                    </Link>
                  </div>
                  <span className={`hidden rounded-full px-2.5 py-1 text-[11.5px] font-medium md:inline ${s.cls}`}>{s.label}</span>
                  <div className={`num text-right text-[16px] font-semibold ${incoming ? "text-ok" : ""}`}>
                    {incoming ? "+" : ""}
                    {money(l.amountCents)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function Tile({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className="surface rounded-[20px] p-4 sm:p-5">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={`num mt-1.5 text-[24px] font-semibold tracking-tight sm:text-[28px] ${accent ? "text-violet" : ""}`}>{value}</div>
      <div className="mt-1 truncate text-[12px] text-faint">{note}</div>
    </div>
  );
}
