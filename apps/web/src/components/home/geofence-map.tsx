"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// A street plan in dots, centred on the job. Dots inside the 150 m geofence
// turn violet; photo pins drop in when the map scrolls into view: three taken
// on site and accepted, one taken across town and turned away.

const W = 600;
const H = 420;
const GAP = 12;
const JOB = { x: 300, y: 214 };
const R = 124; // the 150 m fence, at this map's scale

const PINS = [
  { x: 262, y: 168, label: "L1 · 12 m", ok: true },
  { x: 352, y: 196, label: "L2 · 18 m", ok: true },
  { x: 286, y: 284, label: "L3 · 9 m", ok: true },
  { x: 522, y: 72, label: "Rejected · 412 m away", ok: false },
];

export function GeofenceMap() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const dots = useMemo(() => {
    const out: { x: number; y: number; fill: string; o: number }[] = [];
    for (let row = 0, y = GAP / 2; y < H; row++, y += GAP) {
      for (let col = 0, x = GAP / 2; x < W; col++, x += GAP) {
        // Streets: every ninth column and seventh row stay empty, plus one avenue on a slant.
        if (col % 9 === 4 || row % 7 === 3) continue;
        if (Math.abs(y - (0.55 * x + 30)) < 7) continue;
        const d = Math.hypot(x - JOB.x, y - JOB.y);
        const park = x > 420 && x < 520 && y > 250 && y < 360;
        if (d < R) out.push({ x, y, fill: "var(--color-violet)", o: 0.25 + 0.55 * (1 - d / R) });
        else if (park) out.push({ x, y, fill: "var(--color-brass)", o: 0.3 });
        else out.push({ x, y, fill: "var(--color-ink)", o: 0.11 });
      }
    }
    return out;
  }, []);

  return (
    <div ref={ref} className="clay relative overflow-hidden rounded-[30px] p-4 sm:p-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="A street map in dots around the job, with the 150 metre geofence. Three photos inside it were accepted; one taken 412 metres away was rejected.">
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={2.6} fill={d.fill} opacity={d.o} />
        ))}
        <circle cx={JOB.x} cy={JOB.y} r={R} fill="none" stroke="var(--color-violet)" strokeWidth="1.5" strokeDasharray="4 6" />
        <circle cx={JOB.x} cy={JOB.y} r={R} fill="none" stroke="var(--color-violet)" strokeWidth="2" opacity="0.4" className="origin-center" style={{ transformBox: "fill-box", animation: shown ? "ping-slow 3s var(--ease-out-expo) infinite" : "none" }} />
        <text x={JOB.x + R * 0.7 + 8} y={JOB.y + R * 0.7 + 18} className="fill-violet font-mono text-[11px]">
          150 m
        </text>

        {/* The job */}
        <g style={{ opacity: shown ? 1 : 0, transition: "opacity .6s" }}>
          <circle cx={JOB.x} cy={JOB.y} r={14} fill="var(--color-brass)" />
          <circle cx={JOB.x} cy={JOB.y} r={5} fill="#fff" />
          <rect x={JOB.x + 20} y={JOB.y - 13} width={150} height={26} rx={13} fill="#fff" />
          <text x={JOB.x + 32} y={JOB.y + 4} className="fill-ink text-[12px] font-semibold">
            Job · 12 Admiralty Way
          </text>
        </g>

        {PINS.map((p, i) => {
          const color = p.ok ? "var(--color-ok)" : "var(--color-bad)";
          const w = p.label.length * 6.6 + 22;
          const left = p.x + w + 16 > W;
          return (
            <g
              key={p.label}
              style={{
                opacity: shown ? 1 : 0,
                transform: shown ? "translateY(0)" : "translateY(-24px)",
                transition: `opacity .5s ${400 + i * 260}ms, transform .8s var(--ease-spring) ${400 + i * 260}ms`,
              }}
            >
              <circle cx={p.x} cy={p.y} r={8} fill={color} stroke="#fff" strokeWidth="3" />
              <rect x={left ? p.x - w - 12 : p.x + 12} y={p.y - 11} width={w} height={22} rx={11} fill="#fff" />
              <text x={left ? p.x - w - 1 : p.x + 23} y={p.y + 4} className={`font-mono text-[10.5px] ${p.ok ? "fill-ink" : "fill-bad"}`}>
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 px-1 font-mono text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brass" /> The job</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ok" /> Photo accepted</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-bad" /> Photo rejected</span>
      </div>
    </div>
  );
}
