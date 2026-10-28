import { TileArt } from "@/components/ui/tile-art";

const CHECKS: [string, string, "pass" | "review"][] = [
  ["Taken here", "12 m from the job, GPS ±8 m", "pass"],
  ["Taken now", "One-time token, used after 41 s", "pass"],
  ["Same device", "The phone that started the job", "pass"],
  ["Not the before-photo", "Perceptual distance 29 of 64", "pass"],
  ["Never used before", "Nearest stored photo 31 of 64", "pass"],
  ["Not a screen or print", "No moiré, bezel or glare", "pass"],
  ["Continuous grout in every joint", "All joints filled, colour even", "pass"],
  ["No visible cracks", "None found at 2× zoom", "pass"],
];

export function Inspection({ className = "" }: { className?: string }) {
  return (
    <div className={`surface relative rounded-[28px] p-6 sm:p-8 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="clause uppercase">Inspection report</div>
          <div className="mt-2 text-[20px] font-semibold tracking-tight">L4 · Regrout shower wall</div>
          <div className="mt-1 font-mono text-[11.5px] text-faint">Attempt 2 of 2 · Nov 4, 09:12</div>
        </div>
        <span className="stamp text-ok">✓ Verified</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <figure className="bracket overflow-hidden rounded-xl" style={{ "--bracket": "#b42318" } as React.CSSProperties}>
          <TileArt state="before" className="block aspect-[4/3] w-full" />
          <figcaption className="bg-paper px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">Before · Nov 3</figcaption>
        </figure>
        <figure className="bracket overflow-hidden rounded-xl">
          <TileArt state="after" className="block aspect-[4/3] w-full" />
          <figcaption className="bg-paper px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">After · Nov 4</figcaption>
        </figure>
      </div>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {CHECKS.map(([k, v, r]) => (
          <li key={k} className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <div className="text-[14px] font-medium">{k}</div>
              <div className="font-mono text-[11px] text-muted">{v}</div>
            </div>
            <span className={`shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] ${r === "pass" ? "text-ok" : "text-warn"}`}>{r === "pass" ? "Pass" : "Review"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-xl bg-bad-soft px-3.5 py-2.5 font-mono text-[11.5px] text-bad">
        Attempt 1 · Nov 3, 14:10 · Failed: hairline crack above the soap dish. $110 stayed held.
      </p>
    </div>
  );
}
