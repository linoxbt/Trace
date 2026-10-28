"use client";

// Spec screen 3. Until the scope model lands, the tradesperson writes the lines;
// each one needs a criterion a camera can check.

import { useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { JobView } from "@/server/view";

interface Draft {
  title: string;
  price: string;
  criterion: string;
  mustShow: string;
  mustNotShow: string;
  framing: string;
  verifiableByPhoto: boolean;
}

const blank = (): Draft => ({ title: "", price: "", criterion: "", mustShow: "", mustNotShow: "", framing: "Same angle as the before-photo", verifiableByPhoto: true });
const list = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const cents = (s: string) => Math.round(Number(s.replace(/[^0-9.]/g, "")) * 100);

export function ScopeEditor({ view, onSaved }: { view: JobView; onSaved: () => void }) {
  const [lines, setLines] = useState<Draft[]>(
    view.lines.length
      ? view.lines.map((l) => ({
          title: l.title,
          price: (l.priceCents / 100).toFixed(2),
          criterion: l.criterion,
          mustShow: l.mustShow.join("\n"),
          mustNotShow: l.mustNotShow.join("\n"),
          framing: l.framing,
          verifiableByPhoto: l.verifiableByPhoto,
        }))
      : [blank()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = lines.reduce((n, l) => n + (cents(l.price) || 0), 0);

  const set = (i: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(send: boolean) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/jobs/${view.job.id}/scope`, {
        method: "PUT",
        json: {
          send,
          lines: lines.map((l, i) => ({
            code: `L${i + 1}`,
            title: l.title,
            priceCents: cents(l.price),
            verifiableByPhoto: l.verifiableByPhoto,
            acceptance: { criterion: l.criterion, must_show: list(l.mustShow), must_not_show: list(l.mustNotShow), framing: l.framing },
          })),
        },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Scope</h2>
      {lines.map((l, i) => (
        <div key={i} className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="num text-xs text-muted">L{i + 1}</span>
            {lines.length > 1 && (
              <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="h-8 px-2 text-xs text-bad">Remove</button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
            <input aria-label="Title" placeholder="What gets fixed" value={l.title} maxLength={60} onChange={(e) => set(i, { title: e.target.value })} className="h-11 rounded-lg border border-line px-3" />
            <input aria-label="Price in dollars" inputMode="decimal" placeholder="$0.00" value={l.price} onChange={(e) => set(i, { price: e.target.value })} className="num h-11 rounded-lg border border-line px-3 text-right" />
          </div>
          <input aria-label="Acceptance criterion" placeholder="Done looks like… (one thing a camera can see)" value={l.criterion} maxLength={200} onChange={(e) => set(i, { criterion: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-line px-3" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <textarea aria-label="Must show, one per line" placeholder="Must show (one per line)" rows={3} value={l.mustShow} onChange={(e) => set(i, { mustShow: e.target.value })} className="rounded-lg border border-line p-2 text-sm" />
            <textarea aria-label="Must not show, one per line" placeholder="Must not show" rows={3} value={l.mustNotShow} onChange={(e) => set(i, { mustNotShow: e.target.value })} className="rounded-lg border border-line p-2 text-sm" />
          </div>
          <input aria-label="How to frame the after-photo" value={l.framing} maxLength={160} onChange={(e) => set(i, { framing: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-line px-3 text-sm" />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={l.verifiableByPhoto} onChange={(e) => set(i, { verifiableByPhoto: e.target.checked })} className="h-5 w-5" />
            Visible in an after-photo
          </label>
        </div>
      ))}
      {lines.length < 8 && (
        <button onClick={() => setLines((ls) => [...ls, blank()])} className="h-11 rounded-xl border border-dashed border-line text-sm">Add a line</button>
      )}
      <div className="flex items-center justify-between pt-1">
        <span className="text-sm text-muted">Total</span>
        <span className="num text-lg font-semibold">{money(total, view.job.currency)}</span>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => save(false)} className="h-12 rounded-xl border border-line bg-card font-medium disabled:opacity-60">Save draft</button>
        <button disabled={busy} onClick={() => save(true)} className="h-12 rounded-xl bg-teal font-medium text-white disabled:opacity-60">Send for approval</button>
      </div>
      <p className="text-xs text-muted">Sending freezes the scope. The homeowner then approves it and PayPal holds the total.</p>
    </section>
  );
}
