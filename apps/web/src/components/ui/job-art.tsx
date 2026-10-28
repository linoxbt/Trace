// Illustrated stand-ins for the demo job's photos: a dripping tap, a bath
// edge's sealant, a towel rail and the shower wall's grout, each before and
// after. Neutral materials, so they read as photographs, not as brand art.

import { TileArt } from "./tile-art";

type State = "before" | "after";
const W = 300;
const H = 225;

function Wall({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`wall-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efece6" />
          <stop offset="1" stopColor="#d9d4cb" />
        </linearGradient>
        <linearGradient id={`light-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#wall-${id})`} />
      {Array.from({ length: 4 }).map((_, r) => (
        <line key={r} x1="0" x2={W} y1={r * 56 + 28} y2={r * 56 + 28} stroke="#c9c3b8" strokeWidth="1.5" />
      ))}
      {Array.from({ length: 5 }).map((_, c) => (
        <line key={c} y1="0" y2={H} x1={c * 75 + 37} x2={c * 75 + 37} stroke="#c9c3b8" strokeWidth="1.5" />
      ))}
    </>
  );
}

export function TapArt({ state, className = "" }: { state: State; className?: string }) {
  const id = `tap-${state}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={state === "before" ? "A tap dripping" : "A dry, closed tap"}>
      <Wall id={id} />
      <defs>
        <linearGradient id={`chrome-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfbfb" />
          <stop offset="0.5" stopColor="#b8bcc2" />
          <stop offset="1" stopColor="#7e848c" />
        </linearGradient>
      </defs>
      {/* Basin rim */}
      <rect x="0" y="182" width={W} height="43" fill="#f7f6f3" />
      <rect x="0" y="182" width={W} height="4" fill="#d6d2ca" />
      {/* Tap body and spout */}
      <rect x="126" y="70" width="48" height="26" rx="8" fill={`url(#chrome-${id})`} />
      <rect x="142" y="52" width="16" height="22" rx="4" fill={`url(#chrome-${id})`} />
      <rect x="128" y="44" width="44" height="10" rx="5" fill={`url(#chrome-${id})`} />
      <path d="M152 84 h44 a10 10 0 0 1 10 10 v18 h-14 v-14 h-40 z" fill={`url(#chrome-${id})`} />
      <rect x="192" y="110" width="14" height="5" rx="2" fill="#6f747b" />
      {state === "before" ? (
        <>
          <path d="M199 118 q-4 7 0 10 q4 -3 0 -10 z" fill="#7fb6e0" opacity="0.9" />
          <path d="M199 142 q-5 9 0 13 q5 -4 0 -13 z" fill="#7fb6e0" opacity="0.8" />
          <path d="M199 166 q-4 6 0 9 q4 -3 0 -9 z" fill="#7fb6e0" opacity="0.65" />
          <ellipse cx="199" cy="186" rx="22" ry="4" fill="#7fb6e0" opacity="0.35" />
        </>
      ) : (
        <path d="M193 114 h12" stroke="#ffffff" strokeWidth="1.5" opacity="0.8" />
      )}
      <rect width={W} height={H} fill={`url(#light-${id})`} />
    </svg>
  );
}

export function SealArt({ state, className = "" }: { state: State; className?: string }) {
  const id = `seal-${state}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={state === "before" ? "A bath edge with gaps and mould in the sealant" : "A clean, continuous sealant bead"}>
      <Wall id={id} />
      {/* Bath */}
      <defs>
        <linearGradient id={`bath-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e7e4de" />
        </linearGradient>
      </defs>
      <path d="M0 132 H300 V225 H0 Z" fill={`url(#bath-${id})`} />
      <path d="M0 132 H300" stroke="#cfcac1" strokeWidth="2" />
      {state === "before" ? (
        <>
          <path d="M0 131 H96 M128 131 H202 M236 131 H300" stroke="#e9e6df" strokeWidth="6" strokeLinecap="round" />
          <path d="M96 131 H128 M202 131 H236" stroke="#6d6a62" strokeWidth="4" opacity="0.55" />
          {[18, 44, 71, 150, 168, 182, 258, 280].map((x, i) => (
            <circle key={i} cx={x} cy={130 + (i % 2)} r={1.6 + (i % 3) * 0.6} fill="#38423a" opacity="0.7" />
          ))}
        </>
      ) : (
        <path d="M0 130.5 H300" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
      )}
      <rect width={W} height={H} fill={`url(#light-${id})`} />
    </svg>
  );
}

export function RailArt({ state, className = "" }: { state: State; className?: string }) {
  const id = `rail-${state}`;
  const tilt = state === "before" ? -6 : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={state === "before" ? "A towel rail hanging loose and crooked" : "A level towel rail fixed at both ends"}>
      <Wall id={id} />
      <defs>
        <linearGradient id={`metal-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f6f6" />
          <stop offset="1" stopColor="#8a9098" />
        </linearGradient>
      </defs>
      <g transform={`rotate(${tilt} 70 90)`}>
        <rect x="58" y="80" width="18" height="26" rx="4" fill={`url(#metal-${id})`} />
        <rect x="224" y="80" width="18" height="26" rx="4" fill={`url(#metal-${id})`} />
        <rect x="60" y="88" width="180" height="9" rx="4.5" fill={`url(#metal-${id})`} />
        {/* Towel */}
        <path d="M100 96 h100 v86 q-50 10 -100 0 z" fill="#b9a4e8" opacity="0.92" />
        <path d="M100 160 h100" stroke="#a48fd8" strokeWidth="3" />
      </g>
      {state === "before" && (
        <>
          <circle cx="238" cy="72" r="2.2" fill="#7b756c" />
          <circle cx="246" cy="77" r="1.6" fill="#7b756c" />
          <path d="M232 64 l14 10" stroke="#8d877d" strokeWidth="1.2" />
        </>
      )}
      <rect width={W} height={H} fill={`url(#light-${id})`} />
    </svg>
  );
}

export function GroutArt({ state, className = "", highlight = false }: { state: State; className?: string; highlight?: boolean }) {
  return <TileArt state={state} className={className} highlight={highlight} />;
}

export const ART = { L1: TapArt, L2: SealArt, L3: RailArt, L4: GroutArt } as const;
