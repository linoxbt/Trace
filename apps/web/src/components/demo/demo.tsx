"use client";

// The live demo: one bathroom job, both sides, entirely in the browser. It
// follows the real engine's rules (capture only approved lines, final only
// when nothing else is open, Needs review never released by silence), but
// nothing here calls PayPal or the AI.

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Money } from "@/components/ui/count";
import { StatusChip, LINE_RAIL } from "@/components/status";
import { ART } from "@/components/ui/job-art";
import { money } from "@/lib/format";

type Role = "homeowner" | "tradesperson";
type LS = "PENDING" | "VERIFIED" | "NEEDS_REVIEW" | "FAILED" | "APPROVED" | "FLAGGED" | "CAPTURED";
type Code = "L1" | "L2" | "L3" | "L4";

interface Line {
  code: Code;
  title: string;
  cents: number;
  criterion: string;
  status: LS;
  attempts: number;
  reason: string | null;
  note: string | null;
}

interface Capture {
  cents: number;
  final: boolean;
  codes: Code[];
}

interface Ev {
  id: number;
  at: string;
  who: "Homeowner" | "Tradesperson" | "Trace" | "PayPal";
  text: string;
  tone: "info" | "ok" | "bad" | "warn" | "money";
}

interface State {
  role: Role;
  held: boolean;
  lines: Line[];
  captures: Capture[];
  requested: boolean;
  events: Ev[];
  seq: number;
  clock: number;
}

const START: Line[] = [
  { code: "L1", title: "Fix dripping tap", cents: 12000, criterion: "Tap closed with a dry spout", status: "PENDING", attempts: 0, reason: null, note: null },
  { code: "L2", title: "Reseal bath edge", cents: 9000, criterion: "Continuous white sealant bead, no gaps or mould", status: "PENDING", attempts: 0, reason: null, note: null },
  { code: "L3", title: "Refit towel rail", cents: 10000, criterion: "Rail level and fixed at both ends", status: "PENDING", attempts: 0, reason: null, note: null },
  { code: "L4", title: "Regrout shower wall", cents: 11000, criterion: "Continuous grout in every joint, no visible cracks", status: "PENDING", attempts: 0, reason: null, note: null },
];
const TOTAL = START.reduce((n, l) => n + l.cents, 0);

/** What the verifier "sees" on each attempt. */
function verdict(code: Code, attempt: number): { status: "VERIFIED" | "NEEDS_REVIEW" | "FAILED"; reason: string } {
  if (code === "L4" && attempt === 1) return { status: "FAILED", reason: "Hairline crack in the grout above the soap dish." };
  if (code === "L2" && attempt === 1) return { status: "NEEDS_REVIEW", reason: "Glare on the bead near the taps; not sure the seal is continuous there." };
  return {
    status: "VERIFIED",
    reason: {
      L1: "The spout is dry and the tap is fully closed.",
      L2: "A continuous white bead runs the full length of the edge.",
      L3: "The rail is level and both brackets are fixed to the wall.",
      L4: "Every joint is filled and no cracks are visible.",
    }[code],
  };
}

type Action =
  | { t: "role"; role: Role }
  | { t: "hold" }
  | { t: "proved"; code: Code }
  | { t: "request" }
  | { t: "approve"; code: Code }
  | { t: "flag"; code: Code; note: string }
  | { t: "release" }
  | { t: "reset" };

function stamp(clock: number): string {
  const d = new Date(Date.UTC(2026, 10, 3, 9, 0) + clock * 60_000);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

function log(s: State, who: Ev["who"], text: string, tone: Ev["tone"] = "info"): State {
  const clock = s.clock + 7;
  return { ...s, clock, seq: s.seq + 1, events: [{ id: s.seq + 1, at: stamp(clock), who, text, tone }, ...s.events] };
}

function init(): State {
  return log({ role: "homeowner", held: false, lines: START, captures: [], requested: false, events: [], seq: 0, clock: 0 }, "Tradesperson", "Sent the scope: 4 lines, $420.00");
}

function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "role":
      return { ...s, role: a.role };
    case "reset":
      return init();
    case "hold":
      return log({ ...s, held: true }, "PayPal", "Authorized $420.00 · held, not charged", "money");
    case "proved": {
      const lines = s.lines.map((l) => {
        if (l.code !== a.code) return l;
        const v = verdict(l.code, l.attempts + 1);
        return { ...l, attempts: l.attempts + 1, status: v.status, reason: v.reason, note: null };
      });
      const l = lines.find((x) => x.code === a.code)!;
      return log({ ...s, lines }, "Trace", `${l.code} ${l.status === "VERIFIED" ? "verified" : l.status === "FAILED" ? "failed" : "needs review"}`, l.status === "VERIFIED" ? "ok" : l.status === "FAILED" ? "bad" : "warn");
    }
    case "request":
      return log({ ...s, requested: true }, "Tradesperson", "Requested release · homeowner notified");
    case "approve": {
      const lines = s.lines.map((l) => (l.code === a.code ? { ...l, status: "APPROVED" as LS } : l));
      return log({ ...s, lines }, "Homeowner", `Approved ${a.code}`, "ok");
    }
    case "flag": {
      const lines = s.lines.map((l) => (l.code === a.code ? { ...l, status: "FLAGGED" as LS, note: a.note } : l));
      return log({ ...s, lines }, "Homeowner", `Flagged ${a.code}: ${a.note}`, "warn");
    }
    case "release": {
      const take = s.lines.filter((l) => l.status === "APPROVED");
      if (!take.length) return s;
      const cents = take.reduce((n, l) => n + l.cents, 0);
      const final = s.lines.every((l) => l.status === "CAPTURED" || take.includes(l));
      const lines = s.lines.map((l) => (take.includes(l) ? { ...l, status: "CAPTURED" as LS } : l));
      return log(
        { ...s, lines, captures: [...s.captures, { cents, final, codes: take.map((l) => l.code) }], requested: false },
        "PayPal",
        `Captured ${money(cents)} · final_capture: ${final}`,
        "money",
      );
    }
  }
}

/* =================================================================== page */

export function Demo() {
  const [s, dispatch] = useReducer(reduce, undefined, init);
  const [sheet, setSheet] = useState<null | { kind: "paypal" } | { kind: "camera"; code: Code } | { kind: "flag"; code: Code }>(null);
  const [toast, setToast] = useState<{ id: number; text: string; tone: "ok" | "bad" | "info" } | null>(null);
  const tid = useRef(0);

  const say = (text: string, tone: "ok" | "bad" | "info" = "ok") => {
    const id = ++tid.current;
    setToast({ id, text, tone });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3600);
  };

  const captured = s.captures.reduce((n, c) => n + c.cents, 0);
  const done = s.lines.every((l) => l.status === "CAPTURED");
  const approved = s.lines.filter((l) => l.status === "APPROVED");
  const approvedCents = approved.reduce((n, l) => n + l.cents, 0);
  const toReview = s.lines.filter((l) => l.status === "VERIFIED" || l.status === "NEEDS_REVIEW");
  const toProve = s.lines.filter((l) => ["PENDING", "FAILED", "FLAGGED"].includes(l.status));
  const step = !s.held ? 1 : toProve.length && !toReview.length && !approved.length ? 2 : done ? 4 : 3;

  const hint = guide(s, { done, approvedCents, toReview: toReview.length, toProve: toProve.length });

  return (
    <div>
      {/* Console bar */}
      <div className="surface sticky top-[72px] z-30 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-[22px] px-3 py-2.5 sm:px-4">
        <div role="tablist" aria-label="Play as" className="flex rounded-full bg-paper-2 p-1">
          {(["homeowner", "tradesperson"] as Role[]).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={s.role === r}
              onClick={() => dispatch({ t: "role", role: r })}
              className={`press rounded-full px-4 py-2 text-[13.5px] font-medium capitalize transition-colors duration-300 ${s.role === r ? "bg-card text-ink shadow-[0_1px_3px_rgba(26,19,37,0.15)]" : "text-muted hover:text-ink"}`}
            >
              {r === "homeowner" ? "Homeowner" : "Tradesperson"}
            </button>
          ))}
        </div>
        <ol className="hidden items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] md:flex" aria-label="Progress">
          {["Hold", "Prove", "Review", "Paid"].map((x, i) => (
            <li key={x} className={`flex items-center gap-1.5 ${step > i ? "text-violet" : step === i + 1 ? "text-ink" : "text-faint"}`}>
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${step > i + 1 || (done && i === 3) ? "bg-violet text-white" : step === i + 1 ? "bg-ink text-white" : "bg-paper-2"}`}>
                {step > i + 1 || (done && i === 3) ? "✓" : i + 1}
              </span>
              {x}
              {i < 3 && <span className="mx-1 h-px w-4 bg-line-2" />}
            </li>
          ))}
        </ol>
        <button onClick={() => { dispatch({ t: "reset" }); setSheet(null); }} className="press rounded-full px-3 py-2 text-[13px] font-medium text-muted hover:text-ink">
          ↺ Start over
        </button>
      </div>

      <div className="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-[400px_1fr] lg:gap-10">
        {/* The app, in a phone */}
        <div className="flex justify-center lg:block">
          <div className="relative w-full max-w-[400px] rounded-[48px] bg-[#0d0a12] p-[10px] shadow-[0_50px_100px_-30px_rgba(26,19,37,0.55)]">
            <div className="relative h-[720px] overflow-hidden rounded-[39px] bg-paper">
              <div className="h-full overflow-y-auto overscroll-contain">
                <App
                  s={s}
                  approvedCents={approvedCents}
                  captured={captured}
                  onHold={() => setSheet({ kind: "paypal" })}
                  onProve={(code) => setSheet({ kind: "camera", code })}
                  onApprove={(code) => {
                    dispatch({ t: "approve", code });
                    say(`${code} approved. Release it when you're ready.`);
                  }}
                  onFlag={(code) => setSheet({ kind: "flag", code })}
                  onRequest={() => {
                    dispatch({ t: "request" });
                    say("The homeowner has been asked to review.");
                  }}
                  onRelease={() => {
                    dispatch({ t: "release" });
                    say(`PayPal captured ${money(approvedCents)}.`);
                  }}
                />
              </div>

              {sheet?.kind === "paypal" && (
                <PayPalSheet
                  onCancel={() => setSheet(null)}
                  onApprove={() => {
                    setSheet(null);
                    dispatch({ t: "hold" });
                    say("Held by PayPal. Nothing has been charged.");
                  }}
                />
              )}
              {sheet?.kind === "camera" && (
                <CameraSheet
                  line={s.lines.find((l) => l.code === sheet.code)!}
                  onCancel={() => setSheet(null)}
                  onDone={(code) => {
                    setSheet(null);
                    const l = s.lines.find((x) => x.code === code)!;
                    const v = verdict(code, l.attempts + 1);
                    dispatch({ t: "proved", code });
                    say(v.status === "VERIFIED" ? `${code} verified.` : v.status === "FAILED" ? `${code} failed: ${v.reason}` : `${code} sent to the homeowner for review.`, v.status === "VERIFIED" ? "ok" : v.status === "FAILED" ? "bad" : "info");
                  }}
                />
              )}
              {sheet?.kind === "flag" && (
                <FlagSheet
                  code={sheet.code}
                  onCancel={() => setSheet(null)}
                  onFlag={(note) => {
                    dispatch({ t: "flag", code: sheet.code, note });
                    setSheet(null);
                    say(`${sheet.code} flagged. It stays held until it's fixed.`, "info");
                  }}
                />
              )}

              {toast && (
                <div key={toast.id} className="toast-in pointer-events-none absolute inset-x-3 bottom-4 z-40 flex items-start gap-2.5 rounded-2xl bg-ink px-3.5 py-3 text-[12.5px] font-medium text-white shadow-xl">
                  <span className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] text-ink ${toast.tone === "bad" ? "bg-[#ff9d8f]" : toast.tone === "info" ? "bg-[#ffd98a]" : "bg-lilac"}`}>
                    {toast.tone === "bad" ? "!" : toast.tone === "info" ? "i" : "✓"}
                  </span>
                  {toast.text}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Guide, ledger, timeline */}
        <div className="flex flex-col gap-5">
          <div key={hint.title} className="rise stage grain relative overflow-hidden rounded-[28px] p-6 text-white sm:p-7">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-lilac">{done ? "Done" : "What to do next"}</div>
            <div className="display mt-3 text-[32px] leading-[1.05] sm:text-[38px]">{hint.title}</div>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/70">{hint.body}</p>
            {hint.switchTo && hint.switchTo !== s.role && (
              <button onClick={() => dispatch({ t: "role", role: hint.switchTo! })} className="press mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-medium text-ink hover:bg-violet-soft">
                Switch to the {hint.switchTo} →
              </button>
            )}
            {done && (
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => dispatch({ t: "reset" })} className="press inline-flex h-11 items-center rounded-full bg-white px-5 text-[14px] font-medium text-ink">
                  Run it again
                </button>
                <Link href="/how-it-works" className="press inline-flex h-11 items-center rounded-full border border-white/25 px-5 text-[14px] font-medium">
                  How it works
                </Link>
              </div>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Ledger s={s} captured={captured} />
            <Timeline events={s.events} />
          </div>
          <p className="text-[13px] leading-relaxed text-faint">
            This demo runs entirely in your browser and follows the same rules as the live engine. No PayPal calls are made and nothing is charged. In the live
            app, PayPal&apos;s own window handles approval, and the photo check is done by an AI model.
          </p>
        </div>
      </div>
    </div>
  );
}

function guide(s: State, x: { done: boolean; approvedCents: number; toReview: number; toProve: number }): { title: string; body: string; switchTo?: Role } {
  if (x.done) return { title: "Every line proved and paid.", body: "$420.00 held, $420.00 released, and not a cent before the photos passed. The grout was held back until it was fixed. That's the whole idea." };
  if (!s.held)
    return s.role === "homeowner"
      ? { title: "Approve the scope and place the hold.", body: "Read the four lines and what “done” looks like for each, then approve with PayPal. The $420 is held on your account, not charged." }
      : { title: "Waiting on the homeowner.", body: "The scope is sent. Nothing can be proved until the homeowner approves it and PayPal holds the money.", switchTo: "homeowner" };
  if (x.approvedCents && s.role === "homeowner") return { title: `Release ${money(x.approvedCents)}.`, body: "PayPal captures exactly the lines you approved. Everything else stays held." };
  if (x.toReview && s.role === "homeowner") return { title: "Review the proved work.", body: "Each proved line shows the after-photo and the AI's reason. Approve it, or flag it with a note and it goes back to the tradesperson." };
  if (x.toProve && s.role === "tradesperson") return { title: "Prove each line.", body: "Tap Prove it, line up with the ghost of the before-photo and shoot. Some lines won't pass first time: that's the point." };
  if (x.toReview && s.role === "tradesperson" && !s.requested) return { title: "Ask for release.", body: "Your proved lines go to the homeowner to review. A line the AI verified is released on its own when the review window ends." };
  if (x.toReview || x.approvedCents) return { title: "Over to the homeowner.", body: "Proved lines are waiting for review and release.", switchTo: "homeowner" };
  return { title: "Over to the tradesperson.", body: "The money is held. The work needs proving, line by line.", switchTo: "tradesperson" };
}

/* ==================================================================== app */

function App(p: {
  s: State;
  approvedCents: number;
  captured: number;
  onHold: () => void;
  onProve: (c: Code) => void;
  onApprove: (c: Code) => void;
  onFlag: (c: Code) => void;
  onRequest: () => void;
  onRelease: () => void;
}) {
  const { s } = p;
  const home = s.role === "homeowner";
  const still = s.held ? TOTAL - p.captured : 0;
  const pct = s.held ? (p.captured / TOTAL) * 100 : 0;
  const proved = s.lines.filter((l) => l.status === "VERIFIED" || l.status === "NEEDS_REVIEW");
  const jobStatus = !s.held ? "AWAITING_APPROVAL" : p.captured === TOTAL ? "COMPLETED" : p.captured ? "PARTIALLY_RELEASED" : s.lines.some((l) => l.attempts) ? "IN_PROGRESS" : "AUTHORIZED";

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold">
        <span className="num">9:41</span>
        <span className="h-[22px] w-[86px] rounded-full bg-[#0d0a12]" />
        <span className="h-2 w-3.5 rounded-[2px] border border-ink" />
      </div>
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-medium shadow-[0_0_0_1px_var(--color-line)]">{home ? "Homeowner" : "Tradesperson"}</span>
          <StatusChip status={jobStatus} size="sm" />
        </div>
        <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.03em]">12 Admiralty Way</h2>
        <p className="text-[12.5px] text-muted">Bathroom repair · {home ? "quoted by your tradesperson" : "for the homeowner"}</p>

        <div className="grain relative mt-4 overflow-hidden rounded-[22px] bg-night p-4 text-white">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(closest-side,rgba(138,99,255,0.6),transparent)] blur-lg" />
          <div className="relative">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-white/50">{s.held ? "Held by PayPal" : "Job total"}</div>
            <Money cents={TOTAL} className={`mt-1 block text-[32px] font-semibold tracking-tight ${s.held ? "" : "text-white/55"}`} />
            {s.held ? (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#8a63ff] to-lilac transition-[width] duration-[1400ms] ease-[var(--ease-out-expo)]" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-3 flex justify-between text-[11px] text-white/55">
                  <span>
                    Released <Money cents={p.captured} className="ml-1 text-[13px] font-semibold text-lilac" />
                  </span>
                  <span>
                    Still held <Money cents={still} className="ml-1 text-[13px] font-semibold text-white" />
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11.5px] text-white/50">Nothing held yet.</p>
            )}
          </div>
        </div>

        {!s.held && home && (
          <div className="surface mt-4 rounded-[20px] p-4">
            <div className="text-[15px] font-semibold tracking-tight">Approve and hold {money(TOTAL)}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">PayPal holds it on your account. Each line is paid only after its photos pass.</p>
            <button onClick={p.onHold} className="press btn-primary mt-3 flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium">
              Approve with PayPal
            </button>
          </div>
        )}

        <div className="mt-5 flex items-baseline justify-between">
          <h3 className="text-[15px] font-semibold">Lines</h3>
          <span className="num text-[12px] text-muted">{money(TOTAL)}</span>
        </div>
        <div className="mt-2 space-y-2.5">
          {s.lines.map((l) => (
            <DemoLine
              key={l.code}
              l={l}
              canProve={!home && s.held && ["PENDING", "FAILED", "FLAGGED"].includes(l.status)}
              canDecide={home && (l.status === "VERIFIED" || l.status === "NEEDS_REVIEW")}
              onProve={() => p.onProve(l.code)}
              onApprove={() => p.onApprove(l.code)}
              onFlag={() => p.onFlag(l.code)}
            />
          ))}
        </div>

        {!home && s.held && proved.length > 0 && !s.requested && (
          <button onClick={p.onRequest} className="press btn-primary mt-4 flex h-12 w-full items-center justify-center rounded-full text-[14px] font-medium">
            Request release · {proved.length} line{proved.length > 1 ? "s" : ""}
          </button>
        )}
        {home && p.approvedCents > 0 && (
          <button onClick={p.onRelease} className="press btn-primary mt-4 flex h-12 w-full items-center justify-center rounded-full text-[14px] font-medium">
            Release {money(p.approvedCents)} now
          </button>
        )}
      </div>
    </div>
  );
}

function DemoLine({ l, canProve, canDecide, onProve, onApprove, onFlag }: { l: Line; canProve: boolean; canDecide: boolean; onProve: () => void; onApprove: () => void; onFlag: () => void }) {
  const Art = ART[l.code];
  const shown = l.attempts > 0 && l.status !== "CAPTURED";
  const failedShot = l.code === "L4" && l.attempts === 1;
  return (
    <article className="surface relative overflow-hidden rounded-[18px]">
      <span className={`absolute inset-y-0 left-0 w-1 transition-colors duration-500 ${LINE_RAIL[l.status] ?? "bg-line"}`} aria-hidden />
      <div className="p-3.5 pl-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold tracking-tight">
              <span className="num mr-1 text-[10.5px] text-faint">{l.code}</span>
              {l.title}
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{l.criterion}</p>
          </div>
          <div className="text-right">
            <div className="num text-[13px] font-semibold">{money(l.cents)}</div>
            <div className="mt-1">
              <StatusChip status={l.status} size="sm" />
            </div>
          </div>
        </div>
        {shown && (
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <figure className="bracket overflow-hidden rounded-lg">
              <Art state="before" className="block aspect-[4/3] w-full" />
            </figure>
            <figure className="bracket relative overflow-hidden rounded-lg" style={l.status === "FAILED" ? ({ "--bracket": "#b42318" } as React.CSSProperties) : undefined}>
              {l.code === "L4" ? <ART.L4 state={failedShot ? "before" : "after"} highlight={failedShot} className="block aspect-[4/3] w-full" /> : <Art state="after" className="block aspect-[4/3] w-full" />}
              {l.code === "L2" && l.attempts === 1 && <span className="pointer-events-none absolute right-3 top-6 h-10 w-16 rounded-full bg-white/80 blur-md" />}
            </figure>
          </div>
        )}
        {l.reason && l.status !== "CAPTURED" && <p className="mt-2 rounded-xl bg-paper px-3 py-2 text-[12px] leading-snug text-ink-2">{l.reason}</p>}
        {l.note && l.status === "FLAGGED" && <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[12px] text-warn">Flagged: {l.note}</p>}
        {canProve && (
          <button onClick={onProve} className="press btn-ink mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full text-[13px] font-medium">
            ◉ {l.attempts ? "Re-prove" : "Prove it"}
          </button>
        )}
        {canDecide && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={onFlag} className="press h-10 rounded-full border border-line bg-card text-[13px] font-medium">
              Flag
            </button>
            <button onClick={onApprove} className="press btn-primary h-10 rounded-full text-[13px] font-medium">
              Approve
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ================================================================= sheets */

function Backdrop({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-ink/40 backdrop-blur-[2px]" onClick={onCancel}>
      <div className="toast-in rounded-t-[28px] bg-card p-5 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-2" />
        {children}
      </div>
    </div>
  );
}

function PayPalSheet({ onCancel, onApprove }: { onCancel: () => void; onApprove: () => void }) {
  return (
    <Backdrop onCancel={onCancel}>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">PayPal approval · simulated</div>
      <div className="mt-2 text-[20px] font-semibold tracking-tight">Hold {money(TOTAL)} for this job?</div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">In the live app, PayPal&apos;s own window opens here. The amount is authorized on your account and nothing is charged until work is verified.</p>
      <div className="mt-4 divide-y divide-line rounded-2xl border border-line text-[13px]">
        {START.map((l) => (
          <div key={l.code} className="flex justify-between px-3.5 py-2.5">
            <span>
              <span className="num mr-1 text-[11px] text-faint">{l.code}</span>
              {l.title}
            </span>
            <span className="num">{money(l.cents)}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
        <button onClick={onCancel} className="press h-12 rounded-full border border-line px-5 text-[14px] font-medium">
          Cancel
        </button>
        <button onClick={onApprove} className="press btn-primary h-12 rounded-full text-[14px] font-medium">
          Approve hold
        </button>
      </div>
    </Backdrop>
  );
}

function FlagSheet({ code, onCancel, onFlag }: { code: Code; onCancel: () => void; onFlag: (note: string) => void }) {
  const [note, setNote] = useState(code === "L2" ? "There's still a gap by the taps." : "");
  return (
    <Backdrop onCancel={onCancel}>
      <div className="text-[18px] font-semibold tracking-tight">What still needs doing on {code}?</div>
      <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="field mt-4 text-[14px]" placeholder="Tell the tradesperson what to fix" />
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
        <button onClick={onCancel} className="press h-12 rounded-full border border-line px-5 text-[14px] font-medium">
          Cancel
        </button>
        <button disabled={!note.trim()} onClick={() => onFlag(note.trim())} className="press h-12 rounded-full bg-warn text-[14px] font-medium text-white disabled:opacity-50">
          Flag line
        </button>
      </div>
    </Backdrop>
  );
}

function CameraSheet({ line, onCancel, onDone }: { line: Line; onCancel: () => void; onDone: (c: Code) => void }) {
  const [phase, setPhase] = useState<"aim" | "checking">("aim");
  const done = useRef(onDone);
  done.current = onDone;
  const Art = ART[line.code];
  const next = line.attempts + 1;
  const shotState = line.code === "L4" && next === 1 ? "before" : "after";
  useEffect(() => {
    if (phase !== "checking") return;
    const t = setTimeout(() => done.current(line.code), 1900);
    return () => clearTimeout(t);
  }, [phase, line.code]);
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-night text-white" role="dialog" aria-modal="true" aria-label={`Camera: ${line.code}`}>
      <div className="flex items-center justify-between px-4 pb-2 pt-10">
        <button onClick={onCancel} disabled={phase === "checking"} className="press h-9 rounded-full bg-white/10 px-3.5 text-[12.5px] font-medium disabled:opacity-40">
          Cancel
        </button>
        <div className="text-center">
          <div className="text-[9.5px] uppercase tracking-[0.14em] text-white/50">Prove it</div>
          <div className="text-[13px] font-medium">
            {line.code} · {line.title}
          </div>
        </div>
        <div className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-lilac" />
          <span className="num">±8 m</span>
        </div>
      </div>
      <div className="relative mx-3 mt-2 flex-1 overflow-hidden rounded-[24px]" style={{ "--bracket": "#c6b5ff" } as React.CSSProperties}>
        {line.code === "L4" ? <ART.L4 state={shotState} className="absolute inset-0 h-full w-full" /> : <Art state="after" className="absolute inset-0 h-full w-full" />}
        <Art state="before" className="pointer-events-none absolute inset-0 h-full w-full opacity-25 mix-blend-multiply" />
        {line.code === "L2" && next === 1 && <span className="pointer-events-none absolute right-6 top-1/3 h-16 w-24 rounded-full bg-white/80 blur-lg" />}
        <div className="bracket pointer-events-none absolute inset-5" />
        {phase === "aim" && <div className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] backdrop-blur">Line up with the ghost of the before-photo</div>}
        {phase === "checking" && (
          <>
            <div className="absolute inset-0 animate-scan bg-gradient-to-b from-transparent via-lilac/45 to-transparent" />
            <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/60 p-3 text-[11.5px] backdrop-blur">
              <div className="font-medium">Checking the photo…</div>
              <ul className="mt-1.5 space-y-1 text-white/70">
                <li>✓ 12 m from the job</li>
                <li>✓ Fresh photo, one-time token</li>
                <li className="animate-pulse-soft">◌ Comparing with “{line.criterion}”</li>
              </ul>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center justify-center px-5 pb-8 pt-5">
        <button onClick={() => setPhase("checking")} disabled={phase === "checking"} aria-label="Take photo" className="press group grid h-[70px] w-[70px] place-items-center rounded-full border-[3px] border-white/90 disabled:opacity-40">
          <span className="h-[54px] w-[54px] rounded-full bg-white transition-transform duration-200 group-active:scale-90" />
        </button>
      </div>
    </div>
  );
}

/* ================================================================== rails */

function Ledger({ s, captured }: { s: State; captured: number }) {
  const status = !s.held ? "—" : captured === TOTAL ? "CAPTURED" : captured ? "PARTIALLY_CAPTURED" : "CREATED";
  return (
    <section className="surface rounded-[24px] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-tight">PayPal ledger</h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">simulated</span>
      </div>
      <div className="mt-4 space-y-3 font-mono text-[12px]">
        <Row k="Authorization" sub={s.held ? `status ${status}` : "not placed"} v={s.held ? money(TOTAL) : "—"} />
        {s.captures.map((c, i) => (
          <div key={i} className="toast-in">
            <Row k={`Capture ${i + 1} · ${c.codes.join(", ")}`} sub={`final_capture: ${c.final}`} v={money(c.cents)} accent />
          </div>
        ))}
      </div>
      <div className="rule-dashed mt-4" />
      <div className="mt-3 flex justify-between font-mono text-[12px]">
        <span className="text-muted">Still held</span>
        <Money cents={s.held ? TOTAL - captured : 0} className="font-semibold" />
      </div>
    </section>
  );
}

function Row({ k, sub, v, accent }: { k: string; sub: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-sans text-[13px] font-medium text-ink">{k}</div>
        <div className="text-[10.5px] text-faint">{sub}</div>
      </div>
      <div className={`text-[13px] font-semibold ${accent ? "text-violet" : ""}`}>{v}</div>
    </div>
  );
}

function Timeline({ events }: { events: Ev[] }) {
  const dot = { info: "bg-line-2", ok: "bg-ok", bad: "bg-bad", warn: "bg-warn", money: "bg-violet" } as const;
  return (
    <section className="surface rounded-[24px] p-5">
      <h3 className="text-[15px] font-semibold tracking-tight">Timeline</h3>
      <ol className="relative mt-4 max-h-[300px] overflow-y-auto pr-1">
        <span className="absolute bottom-2 left-[5px] top-2 w-px bg-line" aria-hidden />
        {events.map((e) => (
          <li key={e.id} className="toast-in relative flex gap-3 pb-3 last:pb-0">
            <span className={`relative mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-card ${dot[e.tone]}`} />
            <div>
              <div className="text-[13px] leading-snug">{e.text}</div>
              <div className="num mt-0.5 text-[10.5px] text-faint">
                {e.at} · {e.who}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
