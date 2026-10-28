// Illustrated stand-ins for job photos on the marketing site: a tiled shower
// wall, cracked grout before and a clean regrout after.

export function TileArt({ state, className = "", highlight = false }: { state: "before" | "after"; className?: string; highlight?: boolean }) {
  const cols = 6;
  const rows = 5;
  const w = 300;
  const h = 225;
  const tw = w / cols;
  const th = h / rows;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={state === "before" ? "Cracked grout before the repair" : "Clean grout after the repair"}>
      <defs>
        <linearGradient id={`light-${state}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`tile-${state}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={state === "before" ? "#dfe5e2" : "#e2e9e5"} />
          <stop offset="1" stopColor={state === "before" ? "#cfd7d3" : "#c9d3ce"} />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={state === "before" ? "#a9b2ad" : "#fbfbf8"} />
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((__, c) => (
          <rect key={`${r}-${c}`} x={c * tw + 2} y={r * th + 2} width={tw - 4} height={th - 4} rx="2" fill={`url(#tile-${state})`} />
        )),
      )}
      {state === "before" && (
        <>
          {/* Stained, broken grout lines and a crack running through them. */}
          <path d="M150 0 L150 225" stroke="#8b958f" strokeWidth="3" opacity="0.5" />
          <path d="M0 90 L300 90" stroke="#8b958f" strokeWidth="3" opacity="0.4" />
          <path d="M118 40 L131 62 L126 78 L141 96 L136 118 L152 140 L147 160" fill="none" stroke="#3d4642" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M131 62 L118 70" fill="none" stroke="#3d4642" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M141 96 L156 101" fill="none" stroke="#3d4642" strokeWidth="1.4" strokeLinecap="round" />
          <ellipse cx="210" cy="170" rx="34" ry="14" fill="#6f7a74" opacity="0.18" />
        </>
      )}
      <rect width={w} height={h} fill={`url(#light-${state})`} />
      {highlight && state === "before" && (
        <g>
          <rect x="104" y="32" width="64" height="138" rx="6" fill="#b42318" fillOpacity="0.08" stroke="#b42318" strokeWidth="1.5" strokeDasharray="5 4" />
        </g>
      )}
    </svg>
  );
}
