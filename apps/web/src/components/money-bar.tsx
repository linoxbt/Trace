"use client";

import type { MoneyView } from "@/server/view";
import { Money } from "@/components/ui/count";

/**
 * Money state is always visible (spec section 11): Held, Released, Still held,
 * as a white balance card whose figures glide when a capture lands.
 */
export function MoneyCard({ m, totalCents, badge }: { m: MoneyView; totalCents: number; badge?: React.ReactNode }) {
  const held = m.heldCents;
  const pct = held ? Math.min(100, (m.releasedCents / held) * 100) : 0;
  const placed = !!m.authorizationStatus;
  return (
    <section aria-label="Money" className="rounded-[22px] border border-[#ebebf0] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium text-muted">{placed ? "Held by PayPal" : "Job total"}</span>
        {badge}
      </div>
      <Money cents={placed ? held : totalCents} currency={m.currency} className={`mt-1 block text-[40px] font-semibold tracking-[-0.035em] sm:text-[44px] ${placed ? "" : "text-muted"}`} />
      {placed && m.authorizationStatus !== "VOIDED" && m.authorizationStatus !== "CAPTURED" && <p className="mt-1 text-[13px] text-muted">Not charged until each line is proved.</p>}
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
      {!placed && <p className="mt-3 text-[13.5px] text-muted">Nothing is held yet. The homeowner approves the scope with PayPal to place the hold.</p>}
    </section>
  );
}
