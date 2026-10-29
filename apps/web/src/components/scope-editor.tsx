"use client";

// Spec screen 3. The person doing the work writes the lines, starting from the
// job type's ready-made ones if they like; each needs a criterion a camera can check.

import { useState } from "react";
import { categoryOf, type LineTemplate } from "@trace/core/categories";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { wordsFor } from "@/lib/words";
import type { JobView } from "@/server/view";

interface Draft {
  key: number;
  title: string;
  price: string;
  criterion: string;
  mustShow: string;
  mustNotShow: string;
  framing: string;
  verifiableByPhoto: boolean;
}

let keys = 0;
const blank = (): Draft => ({ key: ++keys, title: "", price: "", criterion: "", mustShow: "", mustNotShow: "", framing: "Same angle as the before-photo", verifiableByPhoto: true });
const fromTemplate = (t: LineTemplate): Draft => ({
  key: ++keys,
  title: t.title,
  price: (t.priceCents / 100).toFixed(2),
  criterion: t.criterion,
  mustShow: t.mustShow.join("\n"),
  mustNotShow: t.mustNotShow.join("\n"),
  framing: t.framing,
  verifiableByPhoto: true,
});
const isBlank = (d: Draft) => !d.title.trim() && !d.price.trim() && !d.criterion.trim() && !d.mustShow.trim();
const list = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const cents = (s: string) => Math.round(Number(s.replace(/[^0-9.]/g, "")) * 100);

export function ScopeEditor({ view, onSaved }: { view: JobView; onSaved: (sent: boolean) => void }) {
  const [lines, setLines] = useState<Draft[]>(
    view.lines.length
      ? view.lines.map((l) => ({
          key: ++keys,
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
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [error, setError] = useState("");
  const total = lines.reduce((n, l) => n + (cents(l.price) || 0), 0);
  const set = (i: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const category = categoryOf(view.job.category);
  const w = wordsFor(view.job.category);
  const eg = category.templates[0]!;
  const used = new Set(lines.map((l) => l.title.trim()));
  // A starter line fills the first empty line, or is added after the others.
  const addTemplate = (t: LineTemplate) =>
    setLines((ls) => {
      const i = ls.findIndex(isBlank);
      return i >= 0 ? ls.map((l, j) => (j === i ? fromTemplate(t) : l)) : ls.length < 8 ? [...ls, fromTemplate(t)] : ls;
    });

  async function save(send: boolean) {
    setBusy(send ? "send" : "save");
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
      onSaved(send);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rise">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[18px] font-semibold tracking-tight">Scope</h2>
        <span className="text-[13px] text-muted">{lines.length} of 8 lines</span>
      </div>
      <p className="mt-1 text-[14px] text-muted">One visible outcome per line. Write what a camera would need to see.</p>

      <div className="mt-4">
        <div className="text-[12.5px] font-medium text-muted">Start from a {category.label.toLowerCase()} line</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {category.templates.map((t) => (
            <button
              key={t.title}
              type="button"
              disabled={used.has(t.title) || (lines.length >= 8 && !lines.some(isBlank))}
              onClick={() => addTemplate(t)}
              className="press inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 text-[13px] font-medium text-ink-2 hover:border-violet hover:text-violet disabled:opacity-40"
            >
              <span aria-hidden className="text-[15px] leading-none">+</span> {t.title}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {lines.map((l, i) => (
          <div key={l.key} className="surface rounded-[22px] p-5">
            <div className="flex items-center justify-between">
              <span className="num rounded-full bg-paper-2 px-2 py-0.5 text-[12px] font-medium text-muted">L{i + 1}</span>
              {lines.length > 1 && (
                <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="press h-8 rounded-full px-3 text-[13px] text-bad hover:bg-bad-soft">
                  Remove
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-[1fr_8rem] gap-2">
              <Field label="Line">
                <input value={l.title} maxLength={60} onChange={(e) => set(i, { title: e.target.value })} placeholder={eg.title} className="field" />
              </Field>
              <Field label="Price (USD)">
                <input inputMode="decimal" value={l.price} onChange={(e) => set(i, { price: e.target.value })} placeholder="0.00" className="field num text-right" />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Done looks like">
                <input value={l.criterion} maxLength={200} onChange={(e) => set(i, { criterion: e.target.value })} placeholder={eg.criterion} className="field" />
              </Field>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Field label="Must show · one per line">
                <textarea rows={3} value={l.mustShow} onChange={(e) => set(i, { mustShow: e.target.value })} placeholder={eg.mustShow.join("\n")} className="field text-[14px]" />
              </Field>
              <Field label="Must not show">
                <textarea rows={3} value={l.mustNotShow} onChange={(e) => set(i, { mustNotShow: e.target.value })} placeholder={eg.mustNotShow.join("\n")} className="field text-[14px]" />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="How to frame the after-photo">
                <input value={l.framing} maxLength={160} onChange={(e) => set(i, { framing: e.target.value })} className="field text-[14px]" />
              </Field>
            </div>
            <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-3 text-[14px]">
              <span>
                Visible in an after-photo
                <span className="block text-[12px] text-faint">Off for hidden work: it goes to the {w.client} to review.</span>
              </span>
              <span className="relative inline-flex">
                <input type="checkbox" className="peer sr-only" checked={l.verifiableByPhoto} onChange={(e) => set(i, { verifiableByPhoto: e.target.checked })} />
                <span className="h-6 w-10 rounded-full bg-line-2 transition-colors duration-300 peer-checked:bg-violet" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ease-[var(--ease-spring)] peer-checked:translate-x-4" />
              </span>
            </label>
          </div>
        ))}
      </div>

      {lines.length < 8 && (
        <button onClick={() => setLines((ls) => [...ls, blank()])} className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[22px] border border-dashed border-line-2 text-[14px] font-medium text-muted hover:border-violet hover:text-violet">
          <span className="text-[18px] leading-none">+</span> Add a line
        </button>
      )}

      <div className="surface sticky bottom-4 z-10 mt-5 rounded-[22px] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-muted">Total to hold</span>
          <span className="num text-[22px] font-semibold tracking-tight">{money(total, view.job.currency)}</span>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        )}
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
          <button disabled={!!busy} onClick={() => save(false)} className="press h-12 rounded-full border border-line bg-card px-5 text-[14px] font-medium disabled:opacity-60">
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button disabled={!!busy} onClick={() => save(true)} className="press btn-primary h-12 rounded-full text-[14px] font-medium disabled:opacity-70">
            {busy === "send" ? "Sending…" : "Send for approval"}
          </button>
        </div>
        <p className="mt-2.5 text-[12px] text-faint">Sending freezes the scope. The {w.client} then approves it and PayPal holds the total.</p>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
