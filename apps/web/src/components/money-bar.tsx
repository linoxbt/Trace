"use client";

import type { MoneyView } from "@/server/view";
import { Money } from "@/components/ui/count";

/**
 * Money state is always visible (spec section 11): Held, Released, Still held,
 * as a dark card whose figures glide when a capture lands.
 */
export function MoneyCard({ m, totalCents }: { m: MoneyView; totalCents: number }) {
  const held = m.heldCents;
  const pct = held ? Math.min(100, (m.releasedCents / held) * 100) : 0;
  const placed = !!m.authorizationStatus;
  return (
    <section aria-label="Money" className="grain relative overflow-hidden rounded-[28px] bg-night p-5 text-white sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(91,47,214,0.55),transparent)] blur-xl" />
      <div className="relative">
        <div className="flex items-center justify-between text-[12px] uppercase tracking-[0.14em] text-white/50">
          <span>{placed ? "Held by PayPal" : "Job total"}</span>
          {placed && m.authorizationStatus !== "VOIDED" && m.authorizationStatus !== "CAPTURED" && (
            <span className="flex items-center gap-1.5 normal-case tracking-normal text-lilac">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-lilac" /> Not charged until verified
            </span>
          )}
        </div>
        <Money cents={placed ? held : totalCents} currency={m.currency} className={`mt-2 block text-[40px] font-semibold tracking-[-0.03em] sm:text-[48px] ${placed ? "" : "text-white/60"}`} />
        {placed && (
          <>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#8a63ff] to-lilac transition-[width] duration-[1400ms] ease-[var(--ease-out-expo)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[12px] text-white/55">
              <span className="h-2 w-2 rounded-full bg-lilac" /> Released
            </div>
            <Money cents={m.releasedCents} currency={m.currency} className="mt-1 block text-[20px] font-semibold text-lilac" />
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 text-[12px] text-white/55">
              <span className="h-2 w-2 rounded-full bg-white/30" /> Still held
            </div>
            <Money cents={m.stillHeldCents} currency={m.currency} className="mt-1 block text-[20px] font-semibold" />
          </div>
        </div>
          </>
        )}
        {!placed && <p className="mt-4 text-[13px] text-white/50">Nothing is held yet. The homeowner approves the scope with PayPal to place the hold.</p>}
      </div>
    </section>
  );
}
