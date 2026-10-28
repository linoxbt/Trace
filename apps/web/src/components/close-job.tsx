"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { JobView } from "@/server/view";

/** Both sides confirm the same lines to drop; then Trace makes the final capture or voids the rest. */
export function CloseJob({ view, onDone }: { view: JobView; onDone: () => void }) {
  const open = view.lines.filter((l) => l.status !== "CAPTURED" && l.status !== "DROPPED");
  const [drop, setDrop] = useState<Set<string>>(new Set(view.job.closeDropLineIds));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mine = view.role === "homeowner" ? view.job.closeConfirmedByHomeowner : view.job.closeConfirmedByTrades;
  const theirs = view.role === "homeowner" ? view.job.closeConfirmedByTrades : view.job.closeConfirmedByHomeowner;

  async function confirm() {
    setBusy(true);
    setMessage("");
    try {
      const r = await api<{ kind: string; for?: string }>(`/api/jobs/${view.job.id}/close`, { json: { dropLineIds: [...drop] } });
      setMessage(r.kind === "waiting" ? `Waiting for the ${r.for} to confirm the same lines.` : "Closed.");
      onDone();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-2xl border border-line bg-card p-4">
      <summary className="cursor-pointer font-medium">Close the job</summary>
      <p className="mt-2 text-sm text-muted">Tick the lines you both agree to drop. Their money is released back to the homeowner. Every other open line must be approved first.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {open.map((l) => (
          <li key={l.id}>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={drop.has(l.id)}
                onChange={(e) => setDrop((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })}
              />
              <span className="flex-1">{l.code} {l.title}</span>
              <span className="num text-sm">{money(l.priceCents, view.job.currency)}</span>
            </label>
          </li>
        ))}
      </ul>
      {theirs && !mine && <p className="mt-2 text-sm">The other side has confirmed. Confirm the same lines to close.</p>}
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}
      <button disabled={busy} onClick={confirm} className="mt-3 h-12 w-full rounded-xl border border-line font-medium disabled:opacity-60">
        {mine ? "Confirm again" : "Confirm close"}
      </button>
    </details>
  );
}
