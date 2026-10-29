"use client";

// Spec screen 5 (job home) with each role's actions inline. Desktop: the lines
// on the left, the money, the next step and the timeline in a sticky rail.
// Phone: money first, then the next step, the lines and the timeline.

import Link from "next/link";
import { categoryOf } from "@trace/core/categories";
import { wordsFor } from "@/lib/words";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JobView } from "@/server/view";
import { api } from "@/lib/api";
import { money, when } from "@/lib/format";
import { MoneyCard } from "./money-bar";
import { LINE_RAIL, StatusChip } from "./status";
import { HoldButton } from "./hold-button";
import { Camera, type CameraResult } from "./camera";
import { ScopeEditor } from "./scope-editor";
import { CloseJob } from "./close-job";
import { ApprovalCard, GuardBadge, InjectionAlert, releaseMessage, ScopeFlag, ShieldIcon } from "./guard";
import { RuleComposer } from "./rules";
import { eventDot as dot, eventLabel as label, GUARD_EVENTS } from "@/lib/events";

type Line = JobView["lines"][number];
type Toast = { id: number; tone: "ok" | "bad" | "info"; text: string };
const HELD = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

export function JobScreen({ initial, paypalClientId, bnCode, sandbox }: { initial: JobView; paypalClientId: string; bnCode: string; sandbox: boolean }) {
  const [view, setView] = useState(initial);
  const [camera, setCamera] = useState<{ mode: "before" | "after"; line?: Line } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const { job, role } = view;
  const isTrades = role === "tradesperson" || role === "both";
  const isHome = role === "homeowner" || role === "both";
  const w = wordsFor(job.category);
  const category = categoryOf(job.category);
  const held = HELD.includes(job.status);

  const toast = useCallback((tone: Toast["tone"], text: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setView(await api<JobView>(`/api/jobs/${job.id}`));
    } catch {
      // Keep the last view; the next poll tries again.
    }
  }, [job.id]);

  // Verdicts and captures also arrive from the worker and PayPal's webhooks.
  useEffect(() => {
    if (job.status === "COMPLETED" || job.status === "CLOSED_VOIDED") return;
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh, job.status]);

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast("ok", ok);
      await refresh();
    } catch (e) {
      toast("bad", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function cameraDone(r: CameraResult) {
    setCamera(null);
    if (!r.verdict) toast("ok", "Photo saved.");
    else if (r.verdict === "VERIFIED") toast("ok", `Verified. The ${w.client} can release it now.`);
    else if (r.verdict === "FAILED") toast("bad", `Didn't pass: ${r.reasons?.join("; ")}`);
    else toast("info", `Sent to the ${w.client} for review: ${r.reasons?.join("; ")}`);
    refresh();
  }

  const proved = view.lines.filter((l) => (l.status === "VERIFIED" || l.status === "NEEDS_REVIEW") && !l.reviewDueAt);
  const approvedCents = view.lines.filter((l) => l.status === "APPROVED").reduce((n, l) => n + l.priceCents, 0);
  const awaitingHome = view.lines.filter((l) => l.status === "VERIFIED" || l.status === "NEEDS_REVIEW");
  const firstBefore = view.lines.find((l) => l.beforeUrl)?.beforeUrl ?? null;
  const pending = view.guard.approvals.filter((a) => a.status === "PENDING");

  async function releaseNow() {
    setBusy(true);
    try {
      const m = releaseMessage(await api(`/api/jobs/${job.id}/release`, { json: {} }), job.currency);
      toast(m.tone, m.text);
      await refresh();
    } catch (e) {
      toast("bad", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function answer(id: string, approve: boolean) {
    setBusy(true);
    try {
      const r = await api<{ kind: string; for?: string; outcome?: string; reasons?: string[]; release?: unknown }>(`/api/approvals/${id}`, { json: { approve } });
      if (r.kind === "denied") toast("info", "Denied. Nothing moved, and the lines stay approved.");
      else if (r.kind === "waiting") toast("info", `Approved. Now waiting for the ${r.for}.`);
      else if (r.release) {
        const m = releaseMessage(r.release, job.currency);
        toast(m.tone, m.text);
      } else toast(r.outcome === "ALLOW" ? "ok" : "bad", r.reasons?.join(" ") || "Done.");
      await refresh();
    } catch (e) {
      toast("bad", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const nextStep = (
    <NextStep>
      {pending.map((a) => (
        <ApprovalCard key={a.id} a={a} currency={job.currency} busy={busy} words={w} onAnswer={(ok) => answer(a.id, ok)} />
      ))}
      {job.status === "DRAFT" && !isTrades && <Waiting title="The scope is being written" body="You'll be able to review every line and its price here." />}
      {job.status === "AWAITING_APPROVAL" && isHome && (job.demo || job.payee.state === "ready") && (
        <HoldButton
          jobId={job.id}
          totalCents={job.totalCents}
          currency={job.currency}
          clientId={paypalClientId}
          merchantId={job.demo ? null : job.payee.merchantId}
          bnCode={bnCode}
          sandbox={sandbox}
          pro={w.pro}
          onHeld={() => { toast("ok", "Held by PayPal. Nothing has been charged."); refresh(); }}
        />
      )}
      {job.status === "AWAITING_APPROVAL" && isHome && !job.demo && job.payee.state !== "ready" && (
        <Waiting title={`Waiting for the ${w.proPos} PayPal`} body={`Payments go straight into the ${w.proPos} own PayPal account, and theirs isn't ready to receive yet. You'll be able to approve as soon as it is.`} />
      )}
      {job.status === "AWAITING_APPROVAL" && !isHome && (
        <Waiting title={`Waiting for the ${w.client}`} body={`We've asked ${job.homeownerEmail} to review the scope and approve the hold with PayPal.`} />
      )}
      {isHome && held && approvedCents > 0 && pending.length === 0 && (
        <ActionCard
          title={`Release ${money(approvedCents, job.currency)}`}
          body="PayPal captures exactly the lines you approved. Everything else stays held."
          cta="Release now"
          busy={busy}
          onClick={releaseNow}
        />
      )}
      {isHome && held && approvedCents === 0 && awaitingHome.length > 0 && (
        <Waiting title={`${awaitingHome.length} line${awaitingHome.length > 1 ? "s" : ""} to review`} body="Approve or flag each proved line below. Verified lines release on their own when the review window ends." />
      )}
      {isTrades && held && proved.length > 0 && (
        <ActionCard
          title="Ask for release"
          body={`${proved.length} proved line${proved.length > 1 ? "s" : ""} will go to the ${w.client} for review.`}
          cta="Request release"
          busy={busy}
          onClick={() => act(() => api(`/api/jobs/${job.id}/release-request`, { json: {} }), `The ${w.client} has been asked to review.`)}
        />
      )}
      {job.status === "COMPLETED" && <Waiting title="Job complete" body="Every line is paid or dropped. The full record stays on the timeline." done />}
      {job.status === "CLOSED_VOIDED" && <Waiting title="Closed" body={`The hold was released back to the ${w.client}.`} done />}
    </NextStep>
  );

  return (
    <div>
      {/* Header */}
      <div className="rise flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span className="rounded-full bg-card px-2.5 py-1 text-[12px] font-medium text-ink-2 shadow-[0_0_0_1px_var(--color-line)]">
              {role === "both" ? "Demo · both sides" : role === "tradesperson" ? w.Pro : w.Client}
            </span>
            <span className="rounded-full bg-violet-soft px-2.5 py-1 text-[12px] font-medium text-violet">{category.label}</span>
            {job.disputed && <span className="rounded-full bg-bad-soft px-2.5 py-1 text-[12px] font-medium text-bad">Disputed</span>}
            {job.demo && <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[12px] font-medium text-warn">Judge mode</span>}
          </div>
          <h1 className="mt-3 truncate text-[30px] font-semibold tracking-[-0.03em] sm:text-[38px]">{job.address}</h1>
          {role === "tradesperson" && <p className="mt-1 text-[14px] text-muted">For {job.homeownerEmail}</p>}
        </div>
        <div className="self-start sm:self-auto">
          <StatusChip status={job.status} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        {/* Rail (first on phones) */}
        <aside className="flex flex-col gap-4 lg:order-2">
          <div className="rise" style={{ "--delay": "60ms" } as React.CSSProperties}>
            <MoneyCard m={view.money} totalCents={job.totalCents} client={w.client} badge={view.money.authorizationStatus ? <GuardBadge guard={view.guard} demo={job.demo} /> : null} />
          </div>
          <div className="rise empty:hidden" style={{ "--delay": "120ms" } as React.CSSProperties}>
            {nextStep}
          </div>
          {held && (
            <div className="rise hidden lg:block" style={{ "--delay": "160ms" } as React.CSSProperties}>
              <CloseJob view={view} onDone={refresh} />
            </div>
          )}
          <div className="rise hidden lg:block" style={{ "--delay": "200ms" } as React.CSSProperties}>
            <Timeline events={view.events} />
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-6 lg:order-1">
          {job.status === "DRAFT" && isTrades && (
            <>
              <section className="rise surface rounded-[24px] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[18px] font-semibold tracking-tight">Before-photos</h2>
                    <p className="mt-1 text-[14px] text-muted">Up to 6, from where the after-photos will be taken. The first sets the job&apos;s location.</p>
                  </div>
                  {firstBefore && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={firstBefore} alt="First before-photo" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                  )}
                </div>
                <button onClick={() => setCamera({ mode: "before" })} className="press btn-ink mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full font-medium">
                  <CameraIcon /> {firstBefore ? "Add another photo" : "Take the first photo"}
                </button>
              </section>
              {!job.demo && job.payee.state !== "ready" && <ConnectPayPal pending={job.payee.state === "pending"} />}
              <ScopeEditor view={view} onSaved={(sent) => { toast("ok", sent ? `Sent. The ${w.client} can approve now.` : "Draft saved."); refresh(); }} />
            </>
          )}

          {job.status !== "DRAFT" && (
            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[18px] font-semibold tracking-tight">Lines</h2>
                <span className="num text-[13px] text-muted">{money(job.totalCents, job.currency)}</span>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {view.lines.map((l, i) => (
                  <div key={l.id} className="rise" style={{ "--delay": `${80 + i * 50}ms` } as React.CSSProperties}>
                    <LineCard
                      line={l}
                      role={role}
                      client={w.client}
                      scopeFlag={view.guard.scopeFlags.find((f) => f.line === l.code)}
                      currency={job.currency}
                      canProve={isTrades && held && ["PENDING", "PROVING", "FAILED", "FLAGGED"].includes(l.status)}
                      canDecide={isHome && (l.status === "VERIFIED" || l.status === "NEEDS_REVIEW")}
                      busy={busy}
                      onProve={() => setCamera({ mode: "after", line: l })}
                      onApprove={() => act(() => api(`/api/lines/${l.id}/decision`, { json: { approve: true } }), `${l.code} approved.`)}
                      onFlag={(note) => act(() => api(`/api/lines/${l.id}/decision`, { json: { approve: false, note } }), `${l.code} flagged. It stays held until it's fixed.`)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {held && (
            <div className="lg:hidden">
              <CloseJob view={view} onDone={refresh} />
            </div>
          )}
          {job.status === "AWAITING_APPROVAL" && isHome && (
            <RuleComposer side="homeowner" scope="job" jobId={job.id} compact onSaved={() => { toast("ok", "Rule saved for this job."); refresh(); }} />
          )}
          <div className="lg:hidden">
            <Timeline events={view.events} />
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-[14px] shadow-[0_20px_40px_-12px_rgba(6,16,14,0.45)] ${
              t.tone === "bad" ? "bg-[#2a0f0c] text-white" : "bg-ink text-white"
            }`}
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                t.tone === "ok" ? "bg-lilac text-ink" : t.tone === "bad" ? "bg-[#ff8a7a] text-ink" : "bg-[#ffd27a] text-ink"
              }`}
              aria-hidden
            >
              {t.tone === "ok" ? "✓" : t.tone === "bad" ? "!" : "i"}
            </span>
            <span className="leading-snug">{t.text}</span>
          </div>
        ))}
      </div>

      {camera && (
        <Camera
          mode={camera.mode}
          jobId={job.id}
          lineId={camera.line?.id}
          title={camera.line ? `${camera.line.code} · ${camera.line.title}` : "Before-photo"}
          framing={camera.line?.framing}
          ghostUrl={camera.line?.beforeUrl}
          onClose={() => {
            setCamera(null);
            refresh();
          }}
          onDone={cameraDone}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ rail parts */

function NextStep({ children }: { children: React.ReactNode }) {
  const empty = !(Array.isArray(children) ? children.some(Boolean) : children);
  if (empty) return null;
  return <div className="flex flex-col gap-3">{children}</div>;
}

function ActionCard({ title, body, cta, busy, onClick }: { title: string; body: string; cta: string; busy: boolean; onClick: () => void }) {
  return (
    <div className="surface rounded-[24px] p-5">
      <div className="text-[17px] font-semibold tracking-tight">{title}</div>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">{body}</p>
      <button disabled={busy} onClick={onClick} className="press btn-primary mt-4 flex h-12 w-full items-center justify-center rounded-full font-medium disabled:opacity-70">
        {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : cta}
      </button>
    </div>
  );
}

function ConnectPayPal({ pending }: { pending: boolean }) {
  return (
    <section className="surface rounded-[24px] border-l-4 border-l-warn p-5">
      <div className="text-[17px] font-semibold tracking-tight">{pending ? "Finish setting up PayPal to send this" : "Connect PayPal to get paid"}</div>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">
        Each approved line is paid straight into your own PayPal business account; Trace never holds the money. Link your account before you send the scope.
      </p>
      <Link href="/settings#get-paid" className="press mt-4 inline-flex h-11 items-center rounded-full bg-violet px-5 text-[14px] font-semibold text-white hover:bg-violet-deep">
        {pending ? "Finish PayPal set-up" : "Connect PayPal"}
      </Link>
    </section>
  );
}

function Waiting({ title, body, done }: { title: string; body: string; done?: boolean }) {
  return (
    <div className="surface flex gap-4 rounded-[24px] p-5">
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${done ? "bg-ok-soft text-ok" : "bg-paper-2 text-muted"}`}>
        {done ? "✓" : <span className="h-2 w-2 animate-pulse-soft rounded-full bg-current" />}
      </span>
      <div>
        <div className="text-[16px] font-semibold tracking-tight">{title}</div>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- line card */

function LineCard(props: {
  line: Line;
  role: JobView["role"];
  /** What this job calls the person paying. */
  client: string;
  scopeFlag?: JobView["guard"]["scopeFlags"][number];
  currency: string;
  canProve: boolean;
  canDecide: boolean;
  busy: boolean;
  onProve: () => void;
  onApprove: () => void;
  onFlag: (note: string) => void;
}) {
  const { line: l } = props;
  const [why, setWhy] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState("");
  const settled = l.status === "CAPTURED" || l.status === "DROPPED";
  const [proof, setProof] = useState(!settled);
  const hasPhotos = !!(l.afterUrl || l.verdict) && proof;

  return (
    <article className="surface relative overflow-hidden rounded-[22px]">
      <span className={`absolute inset-y-0 left-0 w-1 transition-colors duration-500 ${LINE_RAIL[l.status] ?? "bg-line"}`} aria-hidden />
      <div className="p-5 pl-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="num text-[12px] text-faint">{l.code}</span>
              <h3 className={`truncate text-[16px] font-semibold tracking-tight ${l.status === "DROPPED" ? "text-faint line-through" : ""}`}>{l.title}</h3>
            </div>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">{l.criterion}</p>
          </div>
          <div className="text-right">
            <div className="num text-[16px] font-semibold">{money(l.priceCents, props.currency)}</div>
            <div className="mt-1.5">
              <StatusChip status={l.status} size="sm" />
            </div>
          </div>
        </div>

        {l.reviewDueAt && (l.status === "VERIFIED" || l.status === "NEEDS_REVIEW") && (
          <p className="mt-3 text-[12.5px] text-muted">
            {l.status === "VERIFIED" ? "Releases on its own" : `Waits for the ${props.client}`} · review until <span className="num">{when(l.reviewDueAt)}</span>
          </p>
        )}

        {hasPhotos && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Photo url={l.beforeUrl} label="Before" />
            <Photo url={l.afterUrl} label="After" region={l.verdict?.region} tone={l.verdict?.verdict} />
          </div>
        )}

        {settled && (l.afterUrl || l.verdict) && (
          <button onClick={() => setProof((x) => !x)} aria-expanded={proof} className="press mt-3 inline-flex h-8 items-center gap-1 text-[13px] font-medium text-violet">
            {proof ? "Hide proof" : "View proof"}
            <span className={`transition-transform duration-300 ${proof ? "rotate-180" : ""}`} aria-hidden>
              ⌄
            </span>
          </button>
        )}

        {l.verdict && proof && (
          <div className="mt-3 rounded-2xl bg-paper p-3.5">
            <p className="text-[14px] leading-relaxed text-ink-2">{l.verdict.homeownerReason || l.verdict.reasons[0]}</p>
            {l.verdict.reasons.length > 0 && (
              <>
                <button onClick={() => setWhy((w) => !w)} aria-expanded={why} className="press mt-1.5 inline-flex h-8 items-center gap-1 text-[13px] font-medium text-violet">
                  Why?
                  <span className={`transition-transform duration-300 ${why ? "rotate-180" : ""}`} aria-hidden>
                    ⌄
                  </span>
                </button>
                <div className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-out-expo)] ${why ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <ul className="overflow-hidden text-[13px] text-muted">
                    {l.verdict.reasons.map((r, i) => (
                      <li key={i} className="flex gap-2 pt-1.5">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}

        {props.scopeFlag && !settled && <ScopeFlag flag={props.scopeFlag} />}
        {l.injection && proof && <InjectionAlert line={l} role={props.role} client={props.client} />}

        {l.flagNote && l.status === "FLAGGED" && (
          <p className="mt-3 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[14px] text-warn">
            <span className="font-medium">Flagged:</span> {l.flagNote}
          </p>
        )}

        {props.canProve && (
          <button onClick={props.onProve} className="press btn-ink mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-medium">
            <CameraIcon /> {l.status === "FAILED" || l.status === "FLAGGED" ? "Re-prove" : "Prove it"}
          </button>
        )}

        {props.canDecide && !flagging && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button disabled={props.busy} onClick={() => setFlagging(true)} className="press h-11 rounded-full border border-line bg-card text-[14px] font-medium hover:border-line-2">
              Flag
            </button>
            <button disabled={props.busy} onClick={props.onApprove} className="press btn-primary h-11 rounded-full text-[14px] font-medium">
              Approve
            </button>
          </div>
        )}
        {flagging && (
          <form
            className="rise mt-4 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              props.onFlag(note);
              setFlagging(false);
              setNote("");
            }}
          >
            <textarea autoFocus required value={note} onChange={(e) => setNote(e.target.value)} placeholder="What still needs doing?" rows={3} className="field" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setFlagging(false)} className="press h-11 rounded-full border border-line bg-card text-[14px]">
                Cancel
              </button>
              <button className="press h-11 rounded-full bg-warn text-[14px] font-medium text-white">Flag line</button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}

function Photo({ url, label, region, tone }: { url: string | null; label: string; region?: unknown; tone?: string }) {
  const r = region as { x: number; y: number; w: number; h: number } | null | undefined;
  const bracket = tone === "FAILED" ? "#b42318" : tone === "NEEDS_REVIEW" ? "#8f5b00" : undefined;
  return (
    <figure className="bracket overflow-hidden rounded-xl bg-paper-2" style={bracket ? ({ "--bracket": bracket } as React.CSSProperties) : undefined}>
      <div className="relative aspect-[4/3]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${label} photo`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[12px] text-faint">No photo yet</div>
        )}
        {url && r && (
          <span
            className={`absolute rounded-md border-2 border-dashed ${tone === "FAILED" ? "border-bad" : "border-warn"}`}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            aria-label="The area the check looked at"
          />
        )}
      </div>
      <figcaption className="bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted">{label}</figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------- timeline */

function Timeline({ events }: { events: JobView["events"] }) {
  const [all, setAll] = useState(false);
  const list = [...events].reverse();
  const shown = all ? list : list.slice(0, 8);
  return (
    <section className="surface rounded-[24px] p-5">
      <h2 className="text-[16px] font-semibold tracking-tight">Timeline</h2>
      <ol className="relative mt-4">
        <span className="absolute bottom-2 left-[5px] top-2 w-px bg-line" aria-hidden />
        {shown.map((e) => (
          <li key={e.id} className="relative flex gap-3 pb-3.5 last:pb-0">
            {GUARD_EVENTS.has(e.type) ? (
              <span className={`relative grid h-[15px] w-[15px] shrink-0 -translate-x-[2px] place-items-center rounded-full text-white ring-4 ring-card ${dot(e)}`}>
                <ShieldIcon className="h-2.5 w-2.5" />
              </span>
            ) : (
              <span className={`relative mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-card ${dot(e)}`} />
            )}
            <div className="min-w-0">
              <div className="text-[14px] leading-snug">{label(e)}</div>
              {e.type.startsWith("GUARD_") && Array.isArray(e.data?.reasons) && (e.data!.reasons as string[]).length > 1 && (
                <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{(e.data!.reasons as string[]).slice(1).join(" ")}</div>
              )}
              <div className="num mt-0.5 text-[11.5px] text-faint">
                {when(e.at)} · {e.actor}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {list.length > 8 && (
        <button onClick={() => setAll((a) => !a)} className="press mt-3 text-[13px] font-medium text-violet">
          {all ? "Show less" : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}

function CameraIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.3" />
    </svg>
  );
}
