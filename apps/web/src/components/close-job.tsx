"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { JobView } from "@/server/view";
import { wordsFor } from "@/lib/words";

/** Both sides confirm the same lines to drop; then Trace makes the final capture or voids the rest. */
export function CloseJob({ view, onDone }: { view: JobView; onDone: () => void }) {
  const open = view.lines.filter((l) => l.status !== "CAPTURED" && l.status !== "DROPPED");
  const [drop, setDrop] = useState<Set<string>>(new Set(view.job.closeDropLineIds));
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mine = view.role === "homeowner" ? view.job.closeConfirmedByHomeowner : view.job.closeConfirmedByTrades;
  const theirs = view.role === "homeowner" ? view.job.closeConfirmedByTrades : view.job.closeConfirmedByHomeowner;
  const dropCents = open.filter((l) => drop.has(l.id)).reduce((n, l) => n + l.priceCents, 0);

  async function confirm() {
    setBusy(true);
    setMessage("");
    try {
      const r = await api<{ kind: string; for?: string }>(`/api/jobs/${view.job.id}/close`, { json: { dropLineIds: [...drop] } });
      setMessage(r.kind === "waiting" ? `Confirmed. Waiting for the ${r.for} to confirm the same lines.` : "Closed.");
      onDone();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface rounded-[24px]">
      <button onClick={() => setExpanded((x) => !x)} aria-expanded={expanded} className="flex w-full items-center justify-between gap-3 p-5 text-left">
        <span>
          <span className="block text-[16px] font-semibold tracking-tight">Close the job</span>
          <span className="mt-0.5 block text-[13px] text-muted">{theirs && !mine ? "The other side has confirmed. Your turn." : "Drop lines both sides agree on and finish."}</span>
        </span>
        <span className={`grid h-8 w-8 place-items-center rounded-full bg-paper text-muted transition-transform duration-500 ${expanded ? "rotate-45" : ""}`} aria-hidden>
          +
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-out-expo)] ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5">
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {open.map((l) => (
                <li key={l.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[#b42318]"
                      checked={drop.has(l.id)}
                      onChange={(e) =>
                        setDrop((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(l.id);
                          else n.delete(l.id);
                          return n;
                        })
                      }
                    />
                    <span className="flex-1 text-[14px]">
                      <span className="num mr-1.5 text-[12px] text-faint">{l.code}</span>
                      {l.title}
                    </span>
                    <span className="num text-[13px] text-muted">{money(l.priceCents, view.job.currency)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-muted">
              {drop.size ? (
                <>
                  Dropping <span className="num font-medium text-ink">{money(dropCents, view.job.currency)}</span>. It goes back to the {wordsFor(view.job.category).client}. Every other open line must be approved first.
                </>
              ) : (
                "Tick the lines to drop. Every other open line must be approved first."
              )}
            </p>
            {message && (
              <p role="status" className="mt-3 rounded-xl bg-paper px-3 py-2 text-[13px]">
                {message}
              </p>
            )}
            <button disabled={busy} onClick={confirm} className="press btn-ink mt-4 flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium disabled:opacity-70">
              {busy ? "Confirming…" : mine ? "Confirm again" : "Confirm close"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
