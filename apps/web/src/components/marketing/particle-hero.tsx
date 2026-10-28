"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The hero's dot field. About a thousand dots settle into one picture of a job
// at a time (the hold, the proof, the check, the release) and fly to the next
// every few seconds. Pointer pushes them aside; a click bursts them and moves
// on. Each picture is drawn once onto a hidden canvas and sampled on a hex
// grid, so the shapes are plain canvas paths.

type Rgb = [number, number, number];
type Draw = (c: CanvasRenderingContext2D) => void;

const S = 400; // drawing size of each picture
const GAP = S / 46; // hex grid spacing in drawing units

// Fill colours used while drawing: each maps to a dot tone when sampled.
const KEY = { violet: "#ff0000", ink: "#00ff00", brass: "#0000ff", lilac: "#ffff00" } as const;
const INK: Rgb = [22, 18, 29];
const BRASS: Rgb = [192, 138, 91];
const BRASS_LIGHT: Rgb = [226, 182, 143];
const LILAC: Rgb = [198, 181, 255];
const VIOLET_TOP: Rgb = [58, 24, 170];
const VIOLET_BOTTOM: Rgb = [146, 112, 255];

export const STEPS: { label: string; note: string; draw: Draw }[] = [
  {
    label: "Held by PayPal",
    note: "$420.00 on hold",
    draw(c) {
      c.fillStyle = KEY.violet;
      c.beginPath();
      c.roundRect(104, 78, 96, 262, 30);
      c.fill();
      c.strokeStyle = KEY.ink;
      c.lineWidth = 26;
      c.beginPath();
      c.roundRect(240, 104, 64, 210, 18);
      c.stroke();
      c.fillStyle = KEY.brass;
      c.beginPath();
      c.arc(318, 56, 34, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = KEY.lilac;
      c.beginPath();
      c.arc(360, 108, 15, 0, Math.PI * 2);
      c.fill();
    },
  },
  {
    label: "Proved on site",
    note: "photo inside 150 m",
    draw(c) {
      c.strokeStyle = KEY.ink;
      c.lineWidth = 22;
      c.lineCap = "round";
      const a = 46;
      const b = 354;
      const l = 70;
      c.beginPath();
      c.moveTo(a, a + l); c.lineTo(a, a); c.lineTo(a + l, a);
      c.moveTo(b - l, a); c.lineTo(b, a); c.lineTo(b, a + l);
      c.moveTo(b, b - l); c.lineTo(b, b); c.lineTo(b - l, b);
      c.moveTo(a + l, b); c.lineTo(a, b); c.lineTo(a, b - l);
      c.stroke();
      c.fillStyle = KEY.violet;
      c.beginPath();
      c.moveTo(102, 214); c.lineTo(200, 124); c.lineTo(298, 214);
      c.lineTo(276, 214); c.lineTo(276, 302); c.lineTo(124, 302); c.lineTo(124, 214);
      c.closePath();
      c.fill();
      c.globalCompositeOperation = "destination-out";
      c.fillRect(182, 246, 36, 56);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = KEY.brass;
      c.beginPath();
      c.arc(304, 102, 24, Math.PI, 0);
      c.lineTo(304, 150);
      c.closePath();
      c.fill();
    },
  },
  {
    label: "Verified",
    note: "every check passed",
    draw(c) {
      c.strokeStyle = KEY.violet;
      c.lineWidth = 36;
      c.beginPath();
      c.arc(200, 210, 138, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = KEY.ink;
      c.lineWidth = 36;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(134, 212); c.lineTo(184, 260); c.lineTo(272, 160);
      c.stroke();
      c.fillStyle = KEY.brass;
      c.beginPath();
      c.arc(346, 62, 22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = KEY.lilac;
      c.beginPath();
      c.arc(374, 112, 11, 0, Math.PI * 2);
      c.fill();
    },
  },
  {
    label: "Released",
    note: "$310 paid · $110 held",
    draw(c) {
      c.strokeStyle = KEY.ink;
      c.lineWidth = 20;
      c.beginPath();
      c.roundRect(44, 64, 312, 232, 24);
      c.stroke();
      c.fillStyle = KEY.ink;
      c.fillRect(184, 300, 32, 34);
      c.beginPath();
      c.roundRect(132, 330, 136, 18, 9);
      c.fill();
      c.fillStyle = KEY.violet;
      for (const [x, h] of [[92, 82], [152, 128], [212, 168]] as const) {
        c.beginPath();
        c.roundRect(x, 258 - h, 44, h, 8);
        c.fill();
      }
      c.fillStyle = KEY.brass;
      c.beginPath();
      c.roundRect(272, 258 - 110, 44, 110, 8);
      c.fill();
    },
  },
];

type Target = { x: number; y: number; c: Rgb };

function nearestKey(r: number, g: number, b: number): keyof typeof KEY {
  if (r > 160 && g > 160) return "lilac";
  if (r > 160) return "violet";
  if (g > 160) return "ink";
  return "brass";
}

/** Sample a picture on a hex grid into dot targets in 0..1 space, shuffled. */
function sample(draw: Draw, seed: number): Target[] {
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  draw(c);
  const data = c.getImageData(0, 0, S, S).data;
  const out: Target[] = [];
  const rowH = GAP * 0.866;
  for (let row = 0, y = GAP / 2; y < S; row++, y += rowH) {
    for (let x = row % 2 ? GAP : GAP / 2; x < S; x += GAP) {
      const i = (Math.floor(y) * S + Math.floor(x)) * 4;
      if (data[i + 3]! < 200) continue;
      const k = nearestKey(data[i]!, data[i + 1]!, data[i + 2]!);
      const t = y / S;
      let col: Rgb;
      if (k === "violet") col = VIOLET_TOP.map((v, j) => v + (VIOLET_BOTTOM[j]! - v) * t) as Rgb;
      else if (k === "brass") col = (x + y) % 3 < 1 ? BRASS_LIGHT : BRASS;
      else col = k === "ink" ? INK : LILAC;
      out.push({ x: x / S, y: y / S, c: col });
    }
  }
  // Seeded shuffle: dots take new places at random, which reads as a swirl.
  let s = seed * 9301 + 49297;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const DURATION = 4200;

export function ParticleHero() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0); // restarts the pill's progress bar
  const api = useRef<{ go: (i: number, burst?: { x: number; y: number }) => void } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return;
    const ctx = el.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shapes = STEPS.map((s, i) => sample(s.draw, i + 1));
    const N = Math.max(...shapes.map((s) => s.length));

    const x = new Float32Array(N), y = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
    const tx = new Float32Array(N), ty = new Float32Array(N), wait = new Float32Array(N);
    const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N);
    const tr = new Float32Array(N), tg = new Float32Array(N), tb = new Float32Array(N);
    const a = new Float32Array(N), ta = new Float32Array(N), size = new Float32Array(N);
    const nx = new Float32Array(N), ny = new Float32Array(N); // targets in 0..1

    let W = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
    const mouse = { x: -9999, y: -9999 };

    const layout = () => {
      const r = box.getBoundingClientRect();
      W = r.width;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(W * dpr);
      el.height = Math.round(W * dpr);
      scale = W * 0.92;
      ox = W * 0.04;
      oy = W * 0.04;
      for (let i = 0; i < N; i++) {
        tx[i] = ox + nx[i]! * scale;
        ty[i] = oy + ny[i]! * scale;
      }
    };

    const assign = (k: number, burst?: { x: number; y: number }) => {
      const pts = shapes[k]!;
      for (let i = 0; i < N; i++) {
        const p = pts[i % pts.length]!;
        nx[i] = p.x;
        ny[i] = p.y;
        tx[i] = ox + p.x * scale;
        ty[i] = oy + p.y * scale;
        tr[i] = p.c[0];
        tg[i] = p.c[1];
        tb[i] = p.c[2];
        ta[i] = i < pts.length ? 1 : 0;
        wait[i] = still ? 0 : p.x * 22 + Math.random() * 10;
        if (burst) {
          const dx = x[i]! - burst.x;
          const dy = y[i]! - burst.y;
          const d = Math.hypot(dx, dy) || 1;
          const f = 9 + Math.random() * 9;
          vx[i] = vx[i]! + (dx / d) * f;
          vy[i] = vy[i]! + (dy / d) * f;
          wait[i] = wait[i]! + 6;
        } else if (!still) {
          vx[i] = vx[i]! + (Math.random() - 0.5) * 5;
          vy[i] = vy[i]! + (Math.random() - 0.5) * 5 - 1.5;
        }
      }
    };

    layout();
    // First frame: dots rise in from a loose cloud at the centre.
    for (let i = 0; i < N; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * W * 0.5;
      x[i] = W / 2 + Math.cos(ang) * rad;
      y[i] = W / 2 + Math.sin(ang) * rad;
      size[i] = 0.34 + Math.random() * 0.1;
      cr[i] = 200; cg[i] = 196; cb[i] = 210;
    }
    assign(0);
    if (still) {
      for (let i = 0; i < N; i++) {
        x[i] = tx[i]!; y[i] = ty[i]!; cr[i] = tr[i]!; cg[i] = tg[i]!; cb[i] = tb[i]!; a[i] = ta[i]!;
      }
    }

    let raf = 0;
    let visible = true;
    let t0 = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(2.5, (now - t0) / 16.67);
      t0 = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const R = W * 0.13;
      const unit = (scale / S) * GAP;
      for (let i = 0; i < N; i++) {
        if (!still) {
          if (wait[i]! > 0) {
            wait[i] = wait[i]! - dt;
            vx[i] = vx[i]! * 0.94;
            vy[i] = vy[i]! * 0.94;
          } else {
            const wob = Math.sin(now * 0.0016 + i * 0.7) * 0.5;
            vx[i] = (vx[i]! + (tx[i]! + wob - x[i]!) * 0.05 * dt) * 0.82;
            vy[i] = (vy[i]! + (ty[i]! - wob - y[i]!) * 0.05 * dt) * 0.82;
            cr[i] = cr[i]! + (tr[i]! - cr[i]!) * 0.08 * dt;
            cg[i] = cg[i]! + (tg[i]! - cg[i]!) * 0.08 * dt;
            cb[i] = cb[i]! + (tb[i]! - cb[i]!) * 0.08 * dt;
            a[i] = a[i]! + (ta[i]! - a[i]!) * 0.08 * dt;
          }
          const dx = x[i]! - mouse.x;
          const dy = y[i]! - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < R && d > 0.01) {
            const f = (1 - d / R) * 2.4 * dt;
            vx[i] = vx[i]! + (dx / d) * f;
            vy[i] = vy[i]! + (dy / d) * f;
          }
          x[i] = x[i]! + vx[i]! * dt;
          y[i] = y[i]! + vy[i]! * dt;
        }
        const alpha = a[i]!;
        if (alpha < 0.03) continue;
        const r = unit * size[i]!;
        const sp = Math.hypot(vx[i]!, vy[i]!);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${cr[i]! | 0},${cg[i]! | 0},${cb[i]! | 0})`;
        ctx.beginPath();
        if (sp > 1.4) ctx.ellipse(x[i]!, y[i]!, r + Math.min(sp * 0.7, r * 3), r * 0.8, Math.atan2(vy[i]!, vx[i]!), 0, Math.PI * 2);
        else ctx.arc(x[i]!, y[i]!, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!still && visible) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    api.current = {
      go(k, burst) {
        assign(k, burst);
        if (still) {
          for (let i = 0; i < N; i++) {
            x[i] = tx[i]!; y[i] = ty[i]!; cr[i] = tr[i]!; cg[i] = tg[i]!; cb[i] = tb[i]!; a[i] = ta[i]!;
          }
          raf = requestAnimationFrame(frame);
        }
      },
    };

    const ro = new ResizeObserver(() => {
      layout();
      if (still) raf = requestAnimationFrame(frame);
    });
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = !!e?.isIntersecting;
      if (visible && !was && !still) {
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(box);
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const leave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      api.current = null;
    };
  }, []);

  const go = useCallback((k: number, burst?: { x: number; y: number }) => {
    api.current?.go(k, burst);
    setStep(k);
    setCycle((c) => c + 1);
  }, []);

  // Advance on a timer; any manual change restarts it.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => go((step + 1) % STEPS.length), DURATION);
    return () => clearTimeout(t);
  }, [step, cycle, go]);

  const click = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    go((step + 1) % STEPS.length, { x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const s = STEPS[step]!;
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div ref={wrap} className="relative aspect-square w-full" data-cursor="Click">
        <canvas
          ref={canvas}
          onPointerDown={click}
          className="absolute inset-0 h-full w-full touch-pan-y"
          role="img"
          aria-label="Dots forming, in turn: the money held by PayPal, a photo taken on site, a verified check, and money released line by line."
        />
      </div>
      <div className="clay absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full py-2 pl-2 pr-4" aria-live="polite">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet text-white">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-white" />
        </span>
        <span className="min-w-[132px]">
          <span className="block text-[13.5px] font-semibold leading-tight">{s.label}</span>
          <span className="num block whitespace-nowrap text-[11px] text-muted">{s.note}</span>
        </span>
        <span className="flex items-center gap-1.5" role="tablist" aria-label="Steps">
          {STEPS.map((x, i) => (
            <button
              key={x.label}
              role="tab"
              aria-selected={i === step}
              aria-label={x.label}
              onClick={() => go(i)}
              className={`relative h-2 overflow-hidden rounded-full transition-all duration-500 ${i === step ? "w-8 bg-violet/20" : "w-2 bg-ink/15 hover:bg-ink/30"}`}
            >
              {i === step && <span key={cycle} className="absolute inset-y-0 left-0 rounded-full bg-violet" style={{ animation: `grow ${DURATION}ms linear both` }} />}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
