import { Mark } from "@/components/logo";

// The job's money, set as a statement. Every figure here is the demo job's.

const ROWS: [string, string, string, string][] = [
  ["Authorized", "Orders v2 · AUTHORIZE", "420.00", "held"],
  ["Capture 1", "L1 tap · L2 sealant · L3 rail", "310.00", "paid"],
  ["Held back", "L4 grout · crack above soap dish", "110.00", "held"],
  ["Capture 2 · final", "L4 grout · re-proved", "110.00", "paid"],
];

export function Receipt({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="perforated rounded-t-[22px] bg-card px-6 pb-14 pt-6 font-mono text-[12.5px] text-ink shadow-[0_40px_80px_-30px_rgba(10,4,30,0.6)] sm:px-8 sm:pt-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Mark size={26} />
            <div>
              <div className="font-sans text-[15px] font-semibold tracking-[-0.03em]">trace</div>
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-faint">Statement</div>
            </div>
          </div>
          <div className="text-right text-[10.5px] uppercase tracking-[0.1em] text-faint">
            <div>Job 0420</div>
            <div>12 Admiralty Way</div>
          </div>
        </div>
        <div className="rule-dashed mt-6" />
        <ul className="mt-2">
          {ROWS.map(([k, sub, v, kind]) => (
            <li key={k} className="flex items-start justify-between gap-4 py-3">
              <div>
                <div className="font-sans text-[14px] font-medium">{k}</div>
                <div className="mt-0.5 text-[11px] text-muted">{sub}</div>
              </div>
              <div className="text-right">
                <div className={`text-[15px] font-semibold ${kind === "paid" ? "text-violet" : ""}`}>${v}</div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-faint">{kind}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="rule-dashed" />
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-[13px]">
            <span>Paid to the tradesperson</span>
            <span className="font-semibold">$420.00</span>
          </div>
          <div className="flex justify-between text-[13px] text-muted">
            <span>Paid before work was proved</span>
            <span>$0.00</span>
          </div>
          <div className="flex justify-between text-[13px] text-muted">
            <span>Held by Trace, ever</span>
            <span>$0.00</span>
          </div>
        </div>
        <div className="mt-6 flex justify-end text-ok">
          <span className="stamp">✓ Every line proved</span>
        </div>
      </div>
    </div>
  );
}
