import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Empty, PageHeader } from "@/components/app/shell";
import { IconWallet } from "@/components/app/icons";
import { Mark } from "@/components/logo";
import { money, when } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { ledgerOf, profileOf, type LedgerEntry } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

const STATUS: Record<string, { label: string; cls: string }> = {
  CREATED: { label: "held", cls: "text-violet" },
  PARTIALLY_CAPTURED: { label: "part released", cls: "text-violet" },
  CAPTURED: { label: "fully released", cls: "text-ok" },
  VOIDED: { label: "released back", cls: "text-muted" },
  DENIED: { label: "denied", cls: "text-bad" },
  PENDING: { label: "pending", cls: "text-warn" },
  SENDING: { label: "sending", cls: "text-warn" },
  COMPLETED: { label: "paid", cls: "text-ok" },
  DECLINED: { label: "declined", cls: "text-bad" },
  FAILED: { label: "refused · not charged", cls: "text-bad" },
  REFUNDED: { label: "refunded", cls: "text-muted" },
  PARTIALLY_REFUNDED: { label: "part refunded", cls: "text-muted" },
};

const LANDED = ["COMPLETED", "PENDING"];

export default async function Payments() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/payments");
  const [ledger, profile] = await Promise.all([ledgerOf(user.id), profileOf(user.id)]);

  // One section per job, newest activity first; inside, oldest first like a statement.
  const byJob = new Map<string, LedgerEntry[]>();
  for (const l of ledger) byJob.set(l.jobId, [...(byJob.get(l.jobId) ?? []), l]);
  const jobs = [...byJob.entries()].map(([jobId, rows]) => {
    const hold = rows.find((r) => r.kind === "hold");
    const out = rows.filter((r) => r.kind === "release" && LANDED.includes(r.status)).reduce((n, r) => n + r.amountCents, 0);
    const open = hold && (hold.status === "CREATED" || hold.status === "PARTIALLY_CAPTURED");
    return { jobId, address: rows[0]!.address, side: rows[0]!.side, rows: [...rows].reverse(), held: open ? Math.max(0, hold.amountCents - out) : 0, out };
  });
  const earned = jobs.filter((j) => j.side === "tradesperson").reduce((n, j) => n + j.out, 0);
  const paid = jobs.filter((j) => j.side === "homeowner").reduce((n, j) => n + j.out, 0);
  const heldNow = jobs.reduce((n, j) => n + j.held, 0);
  const releases = ledger.filter((l) => l.kind === "release" && LANDED.includes(l.status)).length;

  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Payments"
        title="Held, released, on record."
        body="Every PayPal hold and release on your jobs. Trace never holds the money: holds sit on the homeowner's PayPal account, and releases go straight to the tradesperson's."
      />

      <div className="rise mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]" style={{ "--delay": "80ms" } as React.CSSProperties}>
        {/* The statement */}
        <div className="relative">
          <div className="perforated rounded-t-[26px] bg-card px-5 pb-16 pt-6 font-mono text-[12.5px] text-ink shadow-[0_40px_80px_-40px_rgba(10,4,30,0.45)] sm:px-9 sm:pt-9">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Mark size={32} />
                <div>
                  <div className="font-sans text-[18px] font-semibold tracking-[-0.03em]">trace</div>
                  <div className="text-[10.5px] uppercase tracking-[0.14em] text-faint">Statement · PayPal sandbox</div>
                </div>
              </div>
              <div className="text-right text-[10.5px] uppercase leading-relaxed tracking-[0.12em] text-faint">
                <div>{profile.displayName}</div>
                <div>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
              </div>
            </div>

            {jobs.length === 0 ? (
              <div className="font-sans">
                <Empty icon={<IconWallet />} title="Nothing on record yet" body="When a homeowner approves a scope with PayPal, the hold appears here, then each release as lines are proved." />
              </div>
            ) : (
              jobs.map((j) => (
                <section key={j.jobId} className="mt-8">
                  <div className="flex items-baseline justify-between gap-4">
                    <Link href={`/jobs/${j.jobId}`} className="truncate font-sans text-[16px] font-semibold tracking-tight hover:text-violet">
                      {j.address}
                    </Link>
                    <span className="shrink-0 text-[10.5px] uppercase tracking-[0.14em] text-faint">{j.side === "tradesperson" ? "paid to you" : "paid by you"}</span>
                  </div>
                  <div className="rule-dashed mt-3" />
                  <ul>
                    {j.rows.map((r) => {
                      const s = STATUS[r.status] ?? { label: r.status.toLowerCase(), cls: "text-muted" };
                      return (
                        <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-3">
                          <div className="min-w-0">
                            <div className="font-sans text-[14px] font-medium">{r.kind === "hold" ? "Authorized · held" : r.final ? "Capture · final" : "Capture"}</div>
                            <div className="mt-0.5 truncate text-[11px] text-muted">
                              {when(r.at)} · {r.paypalId ?? "awaiting PayPal"}
                              {r.kind === "hold" && r.expiresAt ? ` · until ${when(r.expiresAt)}` : ""}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-[15px] font-semibold ${r.kind === "release" && LANDED.includes(r.status) ? "text-violet" : ""}`}>{money(r.amountCents)}</div>
                            <div className={`text-[10px] uppercase tracking-[0.12em] ${s.cls}`}>{s.label}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="rule-dashed" />
                  <div className="mt-2.5 flex justify-between text-[12.5px]">
                    <span className="text-muted">Released · still held</span>
                    <span>
                      <span className="font-semibold text-violet">{money(j.out)}</span> · {money(j.held)}
                    </span>
                  </div>
                </section>
              ))
            )}

            {jobs.length > 0 && (
              <>
                <div className="mt-10 h-px bg-ink" />
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-[13px]">
                    <span>Released to you</span>
                    <span className="font-semibold">{money(earned)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span>Released by you</span>
                    <span className="font-semibold">{money(paid)}</span>
                  </div>
                  <div className="flex justify-between text-[13px] text-muted">
                    <span>Still held on PayPal</span>
                    <span>{money(heldNow)}</span>
                  </div>
                  <div className="flex justify-between text-[13px] text-muted">
                    <span>Held by Trace, ever</span>
                    <span>$0.00</span>
                  </div>
                </div>
                <div className="mt-7 flex justify-end text-ok">
                  <span className="stamp">✓ Paid only for proved work</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Totals */}
        <aside className="flex flex-col gap-4 xl:sticky xl:top-24 xl:self-start">
          <div className="stage grain relative overflow-hidden rounded-[26px] p-6 text-white">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">Held now</div>
            <div className="num mt-1.5 text-[34px] font-semibold tracking-tight">{money(heldNow)}</div>
            <div className="mt-1 text-[12.5px] text-white/55">On PayPal holds, not charged</div>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">To you</div>
                <div className="num mt-1 text-[18px] font-semibold text-lilac">{money(earned)}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">By you</div>
                <div className="num mt-1 text-[18px] font-semibold">{money(paid)}</div>
              </div>
            </div>
          </div>
          <div className="clay rounded-[22px] p-5 text-[13px] leading-relaxed text-muted">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-2">{releases} release{releases === 1 ? "" : "s"}</div>
            <p className="mt-2">Each one was checked by the money guard against live PayPal state, and recorded before PayPal was asked.</p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
