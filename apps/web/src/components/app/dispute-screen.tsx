"use client";

// Spec screen 10: the dispute, the drafted response, the evidence pack, and
// "File evidence". The assistant only drafts; filing is the tradesperson's tap.

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { IconCheck, IconDispute, IconDoc } from "./icons";
import { Card, CardHead, IconCircle, Pill } from "./ui";

interface DisputeView {
  id: string;
  jobId: string;
  paypalId: string;
  reason: string | null;
  status: string | null;
  notes: string | null;
  pdfPath: string | null;
  filedAt: string | null;
  role?: "tradesperson" | "homeowner";
}

const pdfUrl = (path: string) => `/api/photos/${path.split("/").map(encodeURIComponent).join("/")}`;

export function DisputeScreen({ initial, reasonLabel, address, amountCents, demoMode }: { initial: DisputeView; reasonLabel: string; address: string; amountCents: number | null; demoMode: boolean }) {
  const [d, setD] = useState(initial);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [busy, setBusy] = useState<null | "draft" | "save" | "file" | "require">(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const trades = initial.role === "tradesperson";
  const waiting = (d.status ?? "").toUpperCase() === "WAITING_FOR_SELLER_RESPONSE";
  const dirty = notes.trim() !== (d.notes ?? "").trim();

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const draft = () =>
    run("draft", async () => {
      const v = await api<DisputeView>(`/api/disputes/${d.id}/draft`, { json: {} });
      setD((x) => ({ ...x, ...v }));
      setNotes(v.notes ?? "");
      setMsg({ tone: "ok", text: "Drafted. Read it, edit anything, then file." });
    });
  const save = () =>
    run("save", async () => {
      const v = await api<DisputeView>(`/api/disputes/${d.id}/notes`, { method: "PUT", json: { notes } });
      setD((x) => ({ ...x, ...v }));
      setMsg({ tone: "ok", text: "Saved, and the evidence pack was updated." });
    });
  const file = () =>
    run("file", async () => {
      const r = await api<{ filed: boolean; outcome: string; reasons: string[]; dispute: DisputeView }>(`/api/disputes/${d.id}/file`, { json: {} });
      setD((x) => ({ ...x, ...r.dispute }));
      setMsg(r.filed ? { tone: "ok", text: "Evidence filed with PayPal." } : { tone: "bad", text: r.reasons.join(" ") || "The guard didn't allow filing." });
    });
  const requireEvidence = () =>
    run("require", async () => {
      const v = await api<DisputeView>(`/api/demo/require-evidence/${d.id}`, { json: {} });
      setD((x) => ({ ...x, ...v }));
      setMsg({ tone: "info", text: "PayPal's sandbox now asks the seller for evidence." });
    });

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <IconCircle tone="red" size={48}>
            <IconDispute className="h-6 w-6" />
          </IconCircle>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-muted">PayPal dispute · {d.paypalId}</div>
            <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.02em]">{reasonLabel}</h1>
            <p className="mt-1 text-[14px] text-muted">
              <Link href={`/jobs/${d.jobId}`} className="font-medium text-ink hover:text-violet">
                {address}
              </Link>
              {amountCents !== null && <> · disputed payment <span className="font-medium tabular-nums text-ink">{money(amountCents)}</span></>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone={d.filedAt ? "green" : waiting ? "amber" : "red"}>{d.filedAt ? "Evidence filed" : (d.status ?? "Open").replace(/_/g, " ").toLowerCase()}</Pill>
            </div>
          </div>
        </div>
        {demoMode && trades && !d.filedAt && !waiting && (
          <div className="mt-5 rounded-2xl bg-warn-soft p-4 text-[13.5px] text-ink-2">
            <div className="font-semibold text-warn">Sandbox step</div>
            PayPal only accepts evidence once it asks the seller for it. In the sandbox you can ask it to now.
            <button disabled={!!busy} onClick={requireEvidence} className="press mt-3 block h-9 rounded-full bg-white px-4 text-[13px] font-semibold shadow-[0_0_0_1px_var(--color-line)] disabled:opacity-50">
              {busy === "require" ? "Asking PayPal…" : "Ask for evidence (sandbox)"}
            </button>
          </div>
        )}
      </Card>

      {msg && (
        <p role="status" className={`rounded-2xl px-4 py-3 text-[14px] ${msg.tone === "ok" ? "bg-ok-soft text-ok" : msg.tone === "bad" ? "bg-bad-soft text-bad" : "bg-violet-soft text-violet"}`}>
          {msg.text}
        </p>
      )}

      <Card className="overflow-hidden">
        <CardHead title="Response" sub={trades ? "Drafted from what's on record. Nothing is sent until you file it." : "The tradesperson's response to PayPal."} />
        <div className="px-5 pb-6 pt-2 sm:px-6">
          {!d.notes && !trades && <p className="text-[14px] text-muted">Not drafted yet.</p>}
          {!d.notes && trades && (
            <div className="rounded-2xl bg-[#f7f7fa] p-5 text-center">
              <p className="text-[14px] text-muted">The assistant writes a reply line by line from the scope, the proof photos, their checks and the client&apos;s own approvals.</p>
              <button disabled={!!busy} onClick={draft} className="press mt-4 inline-flex h-11 items-center rounded-full bg-violet px-6 text-[14px] font-semibold text-white hover:bg-violet-deep disabled:opacity-50">
                {busy === "draft" ? "Drafting…" : "Draft the response"}
              </button>
            </div>
          )}
          {d.notes && (
            <>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                readOnly={!trades || !!d.filedAt}
                rows={10}
                maxLength={2000}
                className="field min-h-[220px] text-[14px] leading-relaxed"
              />
              <div className="mt-1 text-right text-[12px] tabular-nums text-faint">{notes.length} / 2000</div>
              {trades && !d.filedAt && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={!!busy || !dirty} onClick={save} className="press inline-flex h-10 items-center rounded-full bg-[#f1f1f5] px-5 text-[14px] font-semibold disabled:opacity-40">
                    {busy === "save" ? "Saving…" : "Save edits"}
                  </button>
                  <button disabled={!!busy} onClick={draft} className="press inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium text-muted hover:text-ink disabled:opacity-40">
                    {busy === "draft" ? "Drafting…" : "Draft again"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {d.pdfPath && (
        <Card className="overflow-hidden">
          <CardHead
            title="Evidence pack"
            sub="Scope, before and after photos with their checks, approvals, payments and the payment controls."
            action={
              <a href={pdfUrl(d.pdfPath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-violet">
                <IconDoc className="h-4 w-4" /> Open PDF
              </a>
            }
          />
          <div className="px-5 pb-6 pt-2 sm:px-6">
            <iframe title="Evidence pack" src={pdfUrl(d.pdfPath)} className="h-[520px] w-full rounded-2xl border border-[#ebebf0] bg-[#f7f7fa]" />
          </div>
        </Card>
      )}

      {trades && (
        <Card className="p-6">
          {d.filedAt ? (
            <div className="flex items-center gap-3 text-ok">
              <IconCircle tone="green" size={40}>
                <IconCheck className="h-5 w-5" />
              </IconCircle>
              <div>
                <div className="text-[15px] font-semibold">Evidence filed</div>
                <div className="text-[13px] text-muted">PayPal has the response and the evidence pack. Its decision shows on the job timeline.</div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-[15px] font-semibold">File evidence</div>
              <p className="mt-1 text-[13.5px] text-muted">
                Sends the response and the PDF to PayPal. The payment guard checks it first: only the {`job's`} tradesperson can file.
                {!waiting && " PayPal accepts evidence once it asks the seller for it."}
              </p>
              <button
                disabled={!!busy || !d.notes || dirty}
                onClick={file}
                className="press mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-violet text-[15px] font-semibold text-white hover:bg-violet-deep disabled:opacity-40 sm:w-auto sm:px-8"
              >
                {busy === "file" ? "Filing…" : "File evidence"}
              </button>
              {dirty && <p className="mt-2 text-[12.5px] text-warn">Save your edits first.</p>}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
