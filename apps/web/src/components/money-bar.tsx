import type { MoneyView } from "@/server/view";
import { money } from "@/lib/format";

/** Money state is always visible: Held, Released, Still held. */
export function MoneyBar({ m, totalCents }: { m: MoneyView; totalCents: number }) {
  const held = m.heldCents || 0;
  const pct = held ? Math.round((m.releasedCents / held) * 100) : 0;
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-paper/95 px-5 py-3 backdrop-blur">
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Held" value={money(held || (m.authorizationStatus ? 0 : totalCents), m.currency)} dim={!m.authorizationStatus} />
        <Cell label="Released" value={money(m.releasedCents, m.currency)} accent />
        <Cell label="Still held" value={money(m.stillHeldCents, m.currency)} />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-teal transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
      {!m.authorizationStatus && <p className="mt-1.5 text-xs text-muted">Nothing is held yet. The total is shown greyed out.</p>}
    </div>
  );
}

function Cell({ label, value, accent, dim }: { label: string; value: string; accent?: boolean; dim?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`num text-[17px] font-semibold ${accent ? "text-teal" : ""} ${dim ? "text-muted" : ""}`}>{value}</div>
    </div>
  );
}
