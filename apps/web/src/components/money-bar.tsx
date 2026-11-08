"use client";

import { useEffect, useState } from "react";
import type { MoneyView } from "@/server/view";
import { When } from "./when";
import { Money } from "@/components/ui/count";

/**
 * Money state is always visible (spec section 11): Held, Released, Still held,
 * as a white balance card whose figures glide when a capture lands.
 */
export function MoneyCard({ m, totalCents, badge, client = "homeowner" }: { m: MoneyView; totalCents: number; badge?: React.ReactNode; client?: string }) {
  const held = m.heldCents;
  const pct = held ? Math.min(100, (m.releasedCents / held) * 100) : 0;
  const placed = !!m.authorizationStatus;
  // Read the clock only in the browser, so the server's render and the first client render match.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const msLeft = now !== null && m.expiresAt ? new Date(m.expiresAt).getTime() - now : null;
  const ending = placed && m.stillHeldCents > 0 && m.authorizationStatus !== "VOIDED" && msLeft !== null && msLeft > 0 && msLeft <= 3 * 86_400_000;
  const daysLeft = msLeft !== null ? Math.max(1, Math.ceil(msLeft / 86_400_000)) : 0;
  return (
    <section aria-label="Money" className="rounded-[22px] border border-[#ebebf0] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium text-muted">{placed ? "Held by PayPal" : "Job total"}</span>
        {badge}
      </div>
      <Money cents={placed ? held : totalCents} currency={m.currency} className={`mt-1 block text-[40px] font-semibold tracking-[-0.035em] sm:text-[44px] ${placed ? "" : "text-muted"}`} />
      {placed && m.authorizationStatus !== "VOIDED" && m.authorizationStatus !== "CAPTURED" && (
        <p className="mt-1 text-[13px] text-muted">
          Not charged until each line is proved.
          {m.expiresAt && (
            <>
              {" "}PayPal holds it until <When iso={m.expiresAt} />.
            </>
          )}
        </p>
      )}
      {placed && (
        <>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#ececf2]">
            <div className="h-full rounded-full bg-violet transition-[width] duration-[1400ms] ease-[var(--ease-out-expo)]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-ok-soft px-4 py-3">
              <div className="text-[12.5px] font-medium text-ok">Released</div>
              <Money cents={m.releasedCents} currency={m.currency} className="mt-0.5 block text-[19px] font-semibold text-ok" />
            </div>
            <div className="rounded-2xl bg-[#f4f4f8] px-4 py-3">
              <div className="text-[12.5px] font-medium text-muted">Still held</div>
              <Money cents={m.stillHeldCents} currency={m.currency} className="mt-0.5 block text-[19px] font-semibold" />
            </div>
          </div>
        </>
      )}
      {ending && (
        <p role="status" className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-[13px] leading-snug text-warn">
          PayPal&apos;s hold ends in {daysLeft === 1 ? "under a day" : `${daysLeft} days`}. Approved lines are paid before then; anything unfinished goes back to the {client}, uncharged.
        </p>
      )}
      {!placed && <p className="mt-3 text-[13.5px] text-muted">Nothing is held yet. The {client} approves the scope with PayPal to place the hold.</p>}
    </section>
  );
}
