"use client";

// Tripwire on the job screen (add-on spec section 10): the Guarded badge on
// the money card, the approval card, the injection alert and the shield
// entries in the timeline. Each makes the guard visible without slowing a
// normal release down.

import { useEffect, useState } from "react";
import type { JobView } from "@/server/view";
import { money, when } from "@/lib/format";

type Guard = JobView["guard"];
type Approval = Guard["approvals"][number];
type Line = JobView["lines"][number];

const ACTION: Record<string, string> = {
  CAPTURE: "Release",
  FINAL_CAPTURE: "Final release",
  VOID: "Release the hold",
  REAUTHORIZE: "Renew the hold",
  REFUND: "Refund",
  FILE_EVIDENCE: "File dispute evidence",
};

export function ShieldIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/* ----------------------------------------------------------------- badge */

/** "Guarded" on the money card. Tapping it shows the rules in force and the last decision. */
export function GuardBadge({ guard, demo }: { guard: Guard; demo: boolean }) {
  const [open, setOpen] = useState(false);
  const last = guard.decisions.at(-1);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex h-7 items-center gap-1.5 rounded-full bg-white/10 px-2.5 text-[12px] font-medium normal-case tracking-normal text-white hover:bg-white/15"
        aria-haspopup="dialog"
      >
        <ShieldIcon /> Guarded
        {demo && <span className="num rounded-full bg-lilac/25 px-1.5 text-[11px] text-lilac">{guard.decisions.length}</span>}
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} title="Every money move is checked first">
          <p className="text-[14px] leading-relaxed text-muted">
            Before PayPal is asked to move anything, Trace checks the action against live PayPal state and these rules, and writes the decision down. Code decides; the AI never does.
          </p>
          {last && (
            <div className="mt-4 rounded-2xl bg-paper p-3.5">
              <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-faint">Last decision · {when(last.at)}</div>
              <DecisionLine d={last} />
            </div>
          )}
          <h3 className="mt-5 text-[14px] font-semibold">Your rules on this job</h3>
          {guard.rules.length ? (
            <ul className="mt-2 space-y-1.5 text-[14px]">
              {guard.rules.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                  <span>
                    {r.english} <span className="text-faint">· {r.owner}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-muted">No extra rules. The built-in checks below still run.</p>
          )}
          <h3 className="mt-5 text-[14px] font-semibold">Always on</h3>
          <ul className="mt-2 grid gap-1 text-[13px] text-muted">
            {guard.builtins.map((b) => (
              <li key={b.id} className="flex gap-2">
                <span className="num w-7 shrink-0 text-faint">{b.id}</span>
                {b.label}
              </li>
            ))}
          </ul>
          <a href="/rules" className="press mt-5 inline-flex h-10 items-center rounded-full border border-line px-4 text-[13.5px] font-medium hover:border-line-2">
            Manage your rules →
          </a>
        </Sheet>
      )}
    </>
  );
}

function DecisionLine({ d }: { d: Guard["decisions"][number] }) {
  const tone = d.outcome === "ALLOW" ? "text-ok" : d.outcome === "DENY" ? "text-bad" : "text-warn";
  return (
    <div className="mt-1">
      <div className={`text-[14px] font-medium ${tone}`}>{d.reasons[0]}</div>
      {d.reasons.slice(1).map((r, i) => (
        <p key={i} className="mt-0.5 text-[13px] text-muted">
          {r}
        </p>
      ))}
    </div>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="toast-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-card p-6 text-ink shadow-2xl sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-soft text-violet">
              <ShieldIcon className="h-4 w-4" />
            </span>
            {title}
          </h2>
          <button onClick={onClose} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper-2 text-muted" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- approval card */

function useCountdown(iso: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (ms === 0) return "expired";
  return h ? `${h}h ${String(m).padStart(2, "0")}m left` : `${m}:${String(s).padStart(2, "0")} left`;
}

/** A money move the guard held back. Approving re-runs every check; it never skips one. */
export function ApprovalCard({ a, currency, busy, onAnswer }: { a: Approval; currency: string; busy: boolean; onAnswer: (approve: boolean) => void }) {
  const left = useCountdown(a.expiresAt);
  const waitingFor = a.approver === "both" ? (["homeowner", "tradesperson"] as const).filter((x) => !a.approvedBy.includes(x)) : [a.approver];
  return (
    <div className="surface relative overflow-hidden rounded-[24px] p-5 shadow-[0_0_0_2px_var(--color-violet)]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-soft px-2.5 py-1 text-[12px] font-medium text-violet">
          <ShieldIcon /> Needs {a.approver === "both" ? "both of you" : `the ${a.approver}`}
        </span>
        <span className="num text-[12px] text-muted">{left}</span>
      </div>
      <div className="mt-3 text-[20px] font-semibold tracking-tight">
        {ACTION[a.type] ?? a.type} {a.amountCents > 0 && money(a.amountCents, currency)}?
      </div>
      <ul className="mt-2 space-y-1">
        {a.rules.map((r) => (
          <li key={r.id} className="flex gap-2 text-[14px] leading-snug">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
            <span>&ldquo;{r.why}&rdquo;</span>
          </li>
        ))}
      </ul>
      {a.reasons.length > 1 && <p className="mt-2 text-[13px] text-muted">{a.reasons.slice(1).join(" ")}</p>}
      {a.canAnswer ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => onAnswer(false)} className="press h-11 rounded-full border border-line bg-card text-[14px] font-medium hover:border-line-2">
            Deny
          </button>
          <button disabled={busy} onClick={() => onAnswer(true)} className="press btn-primary h-11 rounded-full text-[14px] font-medium">
            Approve
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-muted">Waiting for the {waitingFor.join(" and the ")}. Nothing moves until then.</p>
      )}
      <p className="mt-3 text-[12px] leading-snug text-faint">Approving runs every check again on this exact action. If it expires, the lines stay approved and you can release again.</p>
    </div>
  );
}

/* -------------------------------------------------------- injection alert */

/** The original proof with the text outlined, and the masked copy the work was re-checked on. */
export function InjectionAlert({ line, role }: { line: Line; role: JobView["role"] }) {
  const inj = line.injection;
  if (!inj) return null;
  const trades = role === "tradesperson";
  return (
    <div className="mt-4 rounded-2xl bg-warn-soft p-3.5">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-warn">
        <ShieldIcon className="h-4 w-4" /> {trades ? "Text in your proof was ignored" : "Text in this proof was addressed to the inspector"}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        {trades
          ? "This line needs the homeowner's review."
          : inj.maskedUrl
            ? "We hid it and re-checked the work. Please look before releasing."
            : "It was ignored. Please look before releasing."}
      </p>
      {inj.excerpt && <p className="mt-2 rounded-lg bg-card/70 px-2.5 py-1.5 font-mono text-[12px] text-ink-2">&ldquo;{inj.excerpt}&rdquo;</p>}
      {(line.afterUrl || inj.maskedUrl) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <figure className="overflow-hidden rounded-xl bg-paper-2">
            <div className="relative aspect-[4/3]">
              {line.afterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={line.afterUrl} alt="Proof as taken" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {inj.boxes.map((b, i) => (
                <span
                  key={i}
                  className="absolute rounded-md border-2 border-warn bg-warn/10"
                  style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                  aria-label="Text found in the photo"
                />
              ))}
            </div>
            <figcaption className="bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted">As taken · text outlined</figcaption>
          </figure>
          <figure className="overflow-hidden rounded-xl bg-paper-2">
            <div className="relative aspect-[4/3]">
              {inj.maskedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inj.maskedUrl} alt="Proof with the text hidden" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center px-3 text-center text-[12px] text-faint">No re-check needed: the line didn&apos;t pass anyway</div>
              )}
            </div>
            <figcaption className="bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted">Re-checked with the text hidden</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

/** Scope-time flags: line text that speaks to the AI instead of describing the work. */
export function ScopeFlag({ flag }: { flag: Guard["scopeFlags"][number] }) {
  return (
    <p className="mt-3 flex gap-2 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px] leading-snug text-warn">
      <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        This line has wording aimed at the AI checker (&ldquo;{flag.text}&rdquo;): {flag.why}. Read it closely before approving.
      </span>
    </p>
  );
}

/* --------------------------------------------------------- release toast */

type ReleaseResult =
  | { kind: "captured" | "sending"; amountCents: number }
  | { kind: "nothing" }
  | { kind: "failed"; reason: string }
  | { kind: "needs_approval"; reasons: string[] }
  | { kind: "blocked"; reasons: string[] };

/** What to tell the person after a release, in the guard's own words. */
export function releaseMessage(r: unknown, currency: string): { tone: "ok" | "bad" | "info"; text: string } {
  const x = r as ReleaseResult;
  switch (x?.kind) {
    case "captured":
      return { tone: "ok", text: `Released ${money(x.amountCents, currency)}. PayPal has captured it.` };
    case "sending":
      return { tone: "info", text: `Sending ${money(x.amountCents, currency)} to PayPal. It will show here when it lands.` };
    case "needs_approval":
      return { tone: "info", text: x.reasons.join(" ") };
    case "blocked":
      return { tone: "bad", text: x.reasons.join(" ") };
    case "failed":
      return { tone: "bad", text: `PayPal refused the release, so nothing was charged: ${x.reason}` };
    default:
      return { tone: "info", text: "Nothing to release right now." };
  }
}
