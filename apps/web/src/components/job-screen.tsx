"use client";

// Spec screen 5 (job home) with the role's actions inline: scope and
// before-photos while drafting, the hold for the homeowner, "Prove it" for the
// tradesperson, approve or flag and release for the homeowner, and the close.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { JobView } from "@/server/view";
import { api } from "@/lib/api";
import { money, when } from "@/lib/format";
import { MoneyBar } from "./money-bar";
import { StatusChip } from "./status";
import { HoldButton } from "./hold-button";
import { Camera, type CameraResult } from "./camera";
import { ScopeEditor } from "./scope-editor";
import { CloseJob } from "./close-job";

type Line = JobView["lines"][number];
const HELD = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

export function JobScreen({ initial, paypalClientId, sandbox }: { initial: JobView; paypalClientId: string; sandbox: boolean }) {
  const [view, setView] = useState(initial);
  const [camera, setCamera] = useState<{ mode: "before" | "after"; line?: Line } | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { job, role } = view;
  const isTrades = role === "tradesperson" || role === "both";
  const isHome = role === "homeowner" || role === "both";

  const refresh = useCallback(async () => {
    try {
      setView(await api<JobView>(`/api/jobs/${job.id}`));
    } catch {
      // Keep the last view; the next poll tries again.
    }
  }, [job.id]);

  // Verdicts and captures arrive from the worker and webhooks too.
  useEffect(() => {
    if (job.status === "COMPLETED" || job.status === "CLOSED_VOIDED") return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh, job.status]);

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice({ tone: "ok", text: ok });
      await refresh();
    } catch (e) {
      setNotice({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function cameraDone(r: CameraResult) {
    setCamera(null);
    if (r.verdict) {
      setNotice({
        tone: r.verdict === "FAILED" ? "bad" : "ok",
        text: r.verdict === "VERIFIED" ? "Verified." : r.verdict === "FAILED" ? `Failed: ${r.reasons?.join("; ")}` : `Needs the homeowner's review: ${r.reasons?.join("; ")}`,
      });
    } else setNotice({ tone: "ok", text: "Photo saved." });
    refresh();
  }

  const proved = view.lines.filter((l) => (l.status === "VERIFIED" || l.status === "NEEDS_REVIEW") && !l.reviewDueAt);
  const approvedCents = view.lines.filter((l) => l.status === "APPROVED").reduce((n, l) => n + l.priceCents, 0);
  const firstBefore = view.lines.find((l) => l.beforeUrl)?.beforeUrl ?? null;

  return (
    <main className="pb-12">
      <div className="px-5 pt-6">
        <Link href="/jobs" className="text-sm text-muted">← Jobs</Link>
        <div className="mt-3 flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold leading-snug">{job.address}</h1>
          <StatusChip status={job.status} />
        </div>
        <p className="mt-1 text-xs text-muted">
          {role === "both" ? "Demo: you play both sides" : role === "tradesperson" ? `You're the tradesperson · for ${job.homeownerEmail}` : "You're the homeowner"}
          {job.disputed && " · Disputed"}
        </p>
      </div>

      <div className="mt-4">
        <MoneyBar m={view.money} totalCents={job.totalCents} />
      </div>

      <div className="flex flex-col gap-5 px-5 pt-5">
        {notice && (
          <p role="status" className={`rounded-xl px-4 py-3 text-sm ${notice.tone === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
            {notice.text}
          </p>
        )}

        {job.status === "DRAFT" && isTrades && (
          <>
            <section>
              <h2 className="text-base font-semibold">Before-photos</h2>
              <p className="mt-1 text-sm text-muted">Up to 6. The first one sets the job's location.</p>
              <button onClick={() => setCamera({ mode: "before" })} className="mt-3 h-12 w-full rounded-xl border border-line bg-card font-medium">
                {firstBefore ? "Add another photo" : "Take the first photo"}
              </button>
            </section>
            <ScopeEditor view={view} onSaved={refresh} />
          </>
        )}
        {job.status === "DRAFT" && !isTrades && <p className="text-muted">The tradesperson is still writing the scope.</p>}

        {job.status === "AWAITING_APPROVAL" && isHome && (
          <HoldButton jobId={job.id} totalCents={job.totalCents} currency={job.currency} clientId={paypalClientId} sandbox={sandbox} onHeld={refresh} />
        )}
        {job.status === "AWAITING_APPROVAL" && !isHome && <p className="text-muted">Waiting for the homeowner to approve and hold the money.</p>}

        {job.status !== "DRAFT" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Lines</h2>
            {view.lines.map((l) => (
              <LineCard
                key={l.id}
                line={l}
                currency={job.currency}
                canProve={isTrades && HELD.includes(job.status) && ["PENDING", "PROVING", "FAILED", "FLAGGED"].includes(l.status)}
                canDecide={isHome && (l.status === "VERIFIED" || l.status === "NEEDS_REVIEW")}
                busy={busy}
                onProve={() => setCamera({ mode: "after", line: l })}
                onApprove={() => act(() => api(`/api/lines/${l.id}/decision`, { json: { approve: true } }), `${l.code} approved.`)}
                onFlag={(note) => act(() => api(`/api/lines/${l.id}/decision`, { json: { approve: false, note } }), `${l.code} flagged. The tradesperson will fix it.`)}
              />
            ))}
          </section>
        )}

        {isTrades && HELD.includes(job.status) && proved.length > 0 && (
          <button disabled={busy} onClick={() => act(() => api(`/api/jobs/${job.id}/release-request`, { json: {} }), "The homeowner has been asked to review.")} className="h-12 rounded-xl bg-teal font-medium text-white disabled:opacity-60">
            Request release
          </button>
        )}
        {isHome && approvedCents > 0 && HELD.includes(job.status) && (
          <button disabled={busy} onClick={() => act(() => api(`/api/jobs/${job.id}/release`, { json: {} }))} className="h-12 rounded-xl bg-teal font-medium text-white disabled:opacity-60">
            Release <span className="num">{money(approvedCents, job.currency)}</span> now
          </button>
        )}

        {HELD.includes(job.status) && <CloseJob view={view} onDone={refresh} />}

        <section>
          <h2 className="text-base font-semibold">Timeline</h2>
          <ol className="mt-3 flex flex-col gap-2 border-l border-line pl-4">
            {[...view.events].reverse().map((e) => (
              <li key={e.id} className="text-sm">
                <span className="num text-xs text-muted">{when(e.at)}</span> <span className="font-medium">{label(e)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {camera && (
        <Camera
          mode={camera.mode}
          jobId={job.id}
          lineId={camera.line?.id}
          title={camera.line ? `${camera.line.code} ${camera.line.title}` : "Before-photo"}
          framing={camera.line?.framing}
          ghostUrl={camera.line?.beforeUrl}
          onClose={() => {
            setCamera(null);
            refresh();
          }}
          onDone={cameraDone}
        />
      )}
    </main>
  );
}

function LineCard(props: {
  line: Line;
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
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium"><span className="num text-xs text-muted">{l.code}</span> {l.title}</div>
          <p className="mt-1 text-sm text-muted">{l.criterion}</p>
        </div>
        <div className="num shrink-0 font-semibold">{money(l.priceCents, props.currency)}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusChip status={l.status} />
        {l.reviewDueAt && <span className="num text-xs text-muted">review until {when(l.reviewDueAt)}</span>}
      </div>

      {(l.afterUrl || l.verdict) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Photo url={l.beforeUrl} label="Before" />
          <Photo url={l.afterUrl} label="After" />
        </div>
      )}
      {l.verdict && (
        <div className="mt-2 text-sm">
          <p>{l.verdict.homeownerReason || l.verdict.reasons[0]}</p>
          <button onClick={() => setWhy((w) => !w)} className="mt-1 h-8 text-xs font-medium text-teal">{why ? "Hide why" : "Why?"}</button>
          {why && (
            <ul className="mt-1 list-disc pl-5 text-xs text-muted">
              {l.verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
      {l.flagNote && l.status === "FLAGGED" && <p className="mt-2 rounded-lg bg-warn-soft p-2 text-sm text-warn">Flagged: {l.flagNote}</p>}

      {props.canProve && (
        <button onClick={props.onProve} className="mt-3 h-11 w-full rounded-xl bg-night text-sm font-medium text-white">
          {l.status === "FAILED" || l.status === "FLAGGED" ? "Re-prove" : "Prove it"}
        </button>
      )}
      {props.canDecide && !flagging && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button disabled={props.busy} onClick={() => setFlagging(true)} className="h-11 rounded-xl border border-line text-sm font-medium">Flag</button>
          <button disabled={props.busy} onClick={props.onApprove} className="h-11 rounded-xl bg-teal text-sm font-medium text-white">Approve</button>
        </div>
      )}
      {flagging && (
        <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); props.onFlag(note); setFlagging(false); }}>
          <textarea required value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong?" rows={2} className="rounded-lg border border-line p-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setFlagging(false)} className="h-11 rounded-xl border border-line text-sm">Cancel</button>
            <button className="h-11 rounded-xl bg-warn text-sm font-medium text-white">Flag line</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Photo({ url, label }: { url: string | null; label: string }) {
  return (
    <figure className="bracket overflow-hidden rounded-lg bg-line">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${label} photo`} className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center text-xs text-muted">No photo</div>
      )}
      <figcaption className="px-2 py-1 text-[11px] text-muted">{label}</figcaption>
    </figure>
  );
}

const LABELS: Record<string, string> = {
  JOB_CREATED: "Job created",
  BEFORE_PHOTO: "Before-photo taken",
  SCOPE_SENT: "Scope sent for approval",
  HOMEOWNER_JOINED: "Homeowner joined",
  ORDER_CREATED: "PayPal order created",
  ORDER_APPROVED: "Approved in PayPal",
  AUTHORIZED: "Money held by PayPal",
  VERDICT: "Photo checked",
  RELEASE_REQUESTED: "Release requested",
  LINE_APPROVED: "Line approved",
  LINE_AUTO_APPROVED: "Line approved (review window lapsed)",
  LINE_FLAGGED: "Line flagged",
  RELEASE_STARTED: "Release sent to PayPal",
  CAPTURED: "Money released",
  CAPTURE_FAILED: "Release refused; nothing charged",
  CAPTURE_DENIED: "Release denied by PayPal",
  VOIDED: "Hold released",
  REAUTHORIZED: "Hold renewed",
  REAUTHORIZE_FAILED: "Hold couldn't be renewed",
  CLOSE_CONFIRMED: "Close confirmed",
  CLOSE_AGREED: "Close agreed",
  DISPUTE_OPENED: "Dispute opened",
  DISPUTE_UPDATED: "Dispute updated",
  DISPUTE_RESOLVED: "Dispute resolved",
  REFUNDED: "Refunded",
};

function label(e: JobView["events"][number]): string {
  const base = LABELS[e.type] ?? e.type;
  const d = e.data ?? {};
  if (e.type === "VERDICT") return `${d.line} ${String(d.verdict).toLowerCase().replace("_", " ")}`;
  if ((e.type === "CAPTURED" || e.type === "RELEASE_STARTED") && typeof d.amount_cents === "number") return `${base}: ${money(d.amount_cents)}`;
  if (e.type === "AUTHORIZED" && typeof d.amount_cents === "number") return `${base}: ${money(d.amount_cents)}`;
  if ((e.type === "LINE_APPROVED" || e.type === "LINE_FLAGGED" || e.type === "LINE_AUTO_APPROVED") && d.line) return `${base}: ${d.line}`;
  return base;
}
