"use client";

// Spec screen 3. The person doing the work writes the lines, starting from the
// job type's ready-made ones if they like; each needs a criterion a camera can check.

import { useState } from "react";
import { categoryOf, type LineTemplate } from "@trace/core/categories";
import { PROOF_TYPES, type ProofType } from "@trace/core/proof";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { wordsFor } from "@/lib/words";
import type { JobView } from "@/server/view";

interface DraftedLine {
  title: string;
  suggestedPriceCents: number;
  acceptance: { criterion: string; must_show: string[]; must_not_show: string[]; framing: string };
  verifiableByPhoto: boolean;
  proofType: ProofType;
  proofSpec: unknown;
}

interface SpeechRec {
  continuous: boolean;
  interimResults: boolean;
  onresult: (ev: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start(): void;
  stop(): void;
}

interface Draft {
  key: number;
  title: string;
  price: string;
  criterion: string;
  mustShow: string;
  mustNotShow: string;
  framing: string;
  verifiableByPhoto: boolean;
  proofType: ProofType;
  /** The type's details, as typed (numbers as text until saved). */
  spec: Record<string, string | boolean>;
}

let keys = 0;
const blank = (): Draft => ({ key: ++keys, title: "", price: "", criterion: "", mustShow: "", mustNotShow: "", framing: "Same angle as the before-photo", verifiableByPhoto: true, proofType: "photo", spec: {} });

const TYPE_HELP: Record<ProofType, string> = {
  photo: "A photo of the finished work, from the same angle as the before-photo.",
  video: "A 5 to 20 second clip, for something moving or flowing (no drip, a fan running).",
  document: "Paperwork: a parts receipt, a certificate, an invoice from a supplier.",
  reading: "A photo of a gauge or meter; the number is checked against a target.",
  deliverable: "A file or a link, for work that lives online or in a document.",
  attestation: "A named person signs off, when nothing else can prove it (work inside a wall).",
};
const TYPE_LABEL: Record<ProofType, string> = { photo: "Photo", video: "Video", document: "Document", reading: "Reading", deliverable: "Deliverable", attestation: "Sign-off" };

/** The typed details as the API expects them; numbers parsed, blanks dropped. */
function specOut(d: Draft): unknown {
  const v = d.spec;
  const n = (k: string) => (typeof v[k] === "string" && (v[k] as string).trim() !== "" ? Number((v[k] as string).replace(",", ".")) : undefined);
  const t = (k: string) => (typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim() : undefined);
  switch (d.proofType) {
    case "video":
      return { motion: t("motion") };
    case "document":
      return { doc_kind: t("doc_kind"), total_at_most_price: v.total_at_most_price === true, must_match: [] };
    case "reading":
      return { quantity: t("quantity"), unit: t("unit"), op: t("op") ?? "gte", target: n("target"), target_max: n("target_max") };
    case "deliverable":
      return { kind: t("kind") ?? "url", mime: t("mime") ?? "any" };
    case "attestation":
      return { email: t("email"), name: t("name"), statement: t("statement") };
    default:
      return null;
  }
}

function specIn(type: ProofType, spec: unknown): Record<string, string | boolean> {
  if (!spec || typeof spec !== "object") return {};
  return Object.fromEntries(Object.entries(spec as Record<string, unknown>).map(([k, v]) => [k, typeof v === "boolean" ? v : Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v)]));
}
const fromTemplate = (t: LineTemplate): Draft => ({
  key: ++keys,
  title: t.title,
  price: (t.priceCents / 100).toFixed(2),
  criterion: t.criterion,
  mustShow: t.mustShow.join("\n"),
  mustNotShow: t.mustNotShow.join("\n"),
  framing: t.framing,
  verifiableByPhoto: true,
  proofType: "photo",
  spec: {},
});
const isBlank = (d: Draft) => !d.title.trim() && !d.price.trim() && !d.criterion.trim() && !d.mustShow.trim();
const list = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const cents = (s: string) => Math.round(Number(s.replace(/[^0-9.]/g, "")) * 100);

export function ScopeEditor({ view, onSaved, mode = "scope", onCancel }: { view: JobView; onSaved: (sent: boolean) => void; mode?: "scope" | "change"; onCancel?: () => void }) {
  const change = mode === "change";
  const [lines, setLines] = useState<Draft[]>(
    !change && view.lines.length
      ? view.lines.map((l) => ({
          key: ++keys,
          title: l.title,
          price: (l.priceCents / 100).toFixed(2),
          criterion: l.criterion,
          mustShow: l.mustShow.join("\n"),
          mustNotShow: l.mustNotShow.join("\n"),
          framing: l.framing,
          verifiableByPhoto: l.verifiableByPhoto,
          proofType: l.proof.type,
          spec: specIn(l.proof.type, l.proof.spec),
        }))
      : [blank()],
  );
  const [busy, setBusy] = useState<"save" | "send" | "draft" | null>(null);
  const [desc, setDesc] = useState("");
  const [listening, setListening] = useState(false);
  const [drafted, setDrafted] = useState<string | null>(null);
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

  /** The AI drafts lines from the before-photos and the description; they fill the editor, unsaved. */
  async function draftWithAi() {
    setBusy("draft");
    setError("");
    try {
      const r = await api<{ summary: string; lines: DraftedLine[] }>(`/api/jobs/${view.job.id}/scope/draft`, { json: { description: desc } });
      const fresh = r.lines.map((d): Draft => ({
        key: ++keys,
        title: d.title,
        price: (d.suggestedPriceCents / 100).toFixed(2),
        criterion: d.acceptance.criterion,
        mustShow: d.acceptance.must_show.join("\n"),
        mustNotShow: d.acceptance.must_not_show.join("\n"),
        framing: d.acceptance.framing,
        verifiableByPhoto: d.verifiableByPhoto,
        proofType: d.proofType,
        spec: specIn(d.proofType, d.proofSpec),
      }));
      const keep = lines.filter((l) => !isBlank(l));
      if (keep.length && !confirm("Replace your lines with the AI's draft? Cancel to add the draft below them.")) setLines([...keep, ...fresh].slice(0, 8));
      else setLines(fresh);
      setDrafted(r.summary || "Drafted. Check every line and price before sending.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** Dictation, where the browser has it (Chrome, Safari); typing works everywhere. */
  function dictate() {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Rec) return setError("Dictation isn't available in this browser; type the description instead.");
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const text = Array.from(ev.results).slice(ev.resultIndex).map((x) => x[0]?.transcript ?? "").join(" ");
      setDesc((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}${text.trim()}`.slice(0, 4000));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
    setTimeout(() => rec.stop(), 60_000);
  }

  async function save(send: boolean) {
    setBusy(send ? "send" : "save");
    setError("");
    try {
      if (change) {
        // A change order: the added lines only; codes continue the job's, set by the server.
        await api(`/api/jobs/${view.job.id}/change-orders`, {
          json: {
            lines: lines.map((l) => ({
              title: l.title,
              priceCents: cents(l.price),
              verifiableByPhoto: l.proofType === "photo" ? l.verifiableByPhoto : false,
              proofType: l.proofType,
              proofSpec: specOut(l),
              acceptance: { criterion: l.criterion, must_show: list(l.mustShow), must_not_show: list(l.mustNotShow), framing: l.framing },
            })),
          },
        });
        onSaved(true);
        return;
      }
      await api(`/api/jobs/${view.job.id}/scope`, {
        method: "PUT",
        json: {
          send,
          lines: lines.map((l, i) => ({
            code: `L${i + 1}`,
            title: l.title,
            priceCents: cents(l.price),
            verifiableByPhoto: l.proofType === "photo" ? l.verifiableByPhoto : false,
            proofType: l.proofType,
            proofSpec: specOut(l),
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
        <h2 className="text-[18px] font-semibold tracking-tight">{change ? "Add work" : "Scope"}</h2>
        <span className="text-[13px] text-muted">{lines.length} of 8 lines</span>
      </div>
      <p className="mt-1 text-[14px] text-muted">
        {change ? `A change order: the ${w.client} approves a separate hold for these lines. The original scope stays as agreed.` : "One visible outcome per line. Write what a camera would need to see."}
      </p>

      {!change && (
      <div className="surface mt-4 rounded-[22px] p-5">
        <div className="text-[15px] font-semibold">Draft with AI</div>
        <p className="mt-0.5 text-[13px] text-muted">Describe the job; the AI looks at your before-photos and drafts lines, prices and how each is proved. You edit everything before sending.</p>
        <div className="relative mt-3">
          <textarea
            rows={3}
            value={desc}
            maxLength={4000}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={`e.g. ${category.templates.slice(0, 2).map((t) => t.title.toLowerCase()).join(", ")}…`}
            className="field pr-12 text-[14px]"
          />
          <button
            type="button"
            onClick={dictate}
            aria-label={listening ? "Listening" : "Dictate"}
            className={`press absolute bottom-2.5 right-2.5 grid h-9 w-9 place-items-center rounded-full ${listening ? "animate-pulse bg-bad text-white" : "bg-paper text-ink-2 hover:bg-paper-2"}`}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </button>
        </div>
        <button disabled={!!busy} onClick={draftWithAi} className="press mt-3 inline-flex h-10 items-center rounded-full bg-violet px-5 text-[14px] font-semibold text-white hover:bg-violet-deep disabled:opacity-50">
          {busy === "draft" ? "Drafting…" : "Draft the lines"}
        </button>
        {drafted && <p className="mt-3 rounded-xl bg-violet-soft px-3 py-2 text-[13px] text-violet">{drafted}</p>}
      </div>
      )}

      <div className="mt-4">
        <div className="text-[12.5px] font-medium text-muted">Or start from a {category.label.toLowerCase()} line</div>
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
              <span className="num rounded-full bg-paper-2 px-2 py-0.5 text-[12px] font-medium text-muted">{change ? `New ${i + 1}` : `L${i + 1}`}</span>
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
            <div className="mt-4">
              <span className="text-[12px] font-medium text-muted">Proved by</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`How L${i + 1} is proved`}>
                {PROOF_TYPES.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    role="radio"
                    aria-checked={l.proofType === pt}
                    onClick={() => set(i, { proofType: pt, spec: pt === l.proofType ? l.spec : DEFAULT_SPEC[pt] })}
                    className={`press h-8 rounded-full px-3 text-[12.5px] font-medium ${l.proofType === pt ? "bg-ink text-white" : "bg-paper text-ink-2 hover:bg-paper-2"}`}
                  >
                    {TYPE_LABEL[pt]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-faint">{TYPE_HELP[l.proofType]}</p>
              <SpecFields d={l} onChange={(spec) => set(i, { spec: { ...l.spec, ...spec } })} />
            </div>
            {(l.proofType === "photo" || l.proofType === "video" || l.proofType === "reading") && (
            <div className="mt-3">
              <Field label={l.proofType === "video" ? "How to frame the clip" : l.proofType === "reading" ? "How to frame the gauge" : "How to frame the after-photo"}>
                <input value={l.framing} maxLength={160} onChange={(e) => set(i, { framing: e.target.value })} className="field text-[14px]" />
              </Field>
            </div>
            )}
            {l.proofType === "photo" && (
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
            )}
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
          <span className="text-[14px] text-muted">{change ? "Extra to hold" : "Total to hold"}</span>
          <span className="num text-[22px] font-semibold tracking-tight">{money(total, view.job.currency)}</span>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        )}
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
          {change ? (
            <button disabled={!!busy} onClick={onCancel} className="press h-12 rounded-full border border-line bg-card px-5 text-[14px] font-medium disabled:opacity-60">
              Cancel
            </button>
          ) : (
            <button disabled={!!busy} onClick={() => save(false)} className="press h-12 rounded-full border border-line bg-card px-5 text-[14px] font-medium disabled:opacity-60">
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
          )}
          <button disabled={!!busy} onClick={() => save(true)} className="press btn-primary h-12 rounded-full text-[14px] font-medium disabled:opacity-70">
            {busy === "send" ? "Sending…" : change ? "Send change order" : "Send for approval"}
          </button>
        </div>
        <p className="mt-2.5 text-[12px] text-faint">
          {change ? `The ${w.client} approves these lines and PayPal holds their total separately.` : `Sending freezes the scope. The ${w.client} then approves it and PayPal holds the total.`}
        </p>
      </div>
    </section>
  );
}

const DEFAULT_SPEC: Record<ProofType, Record<string, string | boolean>> = {
  photo: {},
  video: { motion: "" },
  document: { doc_kind: "receipt", total_at_most_price: true },
  reading: { quantity: "", unit: "", op: "gte", target: "" },
  deliverable: { kind: "url", mime: "any" },
  attestation: { email: "", statement: "" },
};

function SpecFields({ d, onChange }: { d: Draft; onChange: (spec: Record<string, string | boolean>) => void }) {
  const v = d.spec;
  const text = (k: string, label: string, placeholder: string, opts: { type?: string; max?: number; wide?: boolean } = {}) => (
    <div className={opts.wide ? "sm:col-span-2" : ""}>
      <Field label={label}>
        <input type={opts.type ?? "text"} value={String(v[k] ?? "")} maxLength={opts.max ?? 200} placeholder={placeholder} onChange={(e) => onChange({ [k]: e.target.value })} className="field text-[14px]" />
      </Field>
    </div>
  );
  if (d.proofType === "photo") return null;
  return (
    <div className="mt-3 grid gap-2 rounded-2xl bg-paper p-3 sm:grid-cols-2">
      {d.proofType === "video" && text("motion", "What the clip must show over time", "No drip from the spout over the whole clip", { wide: true })}
      {d.proofType === "document" && (
        <>
          {text("doc_kind", "Kind of document", "Parts receipt", { max: 60 })}
          <label className="flex items-center gap-2 self-end pb-3 text-[13px] text-ink-2">
            <input type="checkbox" checked={v.total_at_most_price === true} onChange={(e) => onChange({ total_at_most_price: e.target.checked })} />
            Its total must be within the line&apos;s price
          </label>
        </>
      )}
      {d.proofType === "reading" && (
        <>
          {text("quantity", "What is read", "Boiler pressure", { max: 60 })}
          {text("unit", "Unit", "bar", { max: 20 })}
          <Field label="Passes when it is">
            <select value={String(v.op ?? "gte")} onChange={(e) => onChange({ op: e.target.value })} className="field text-[14px]">
              <option value="gte">at least</option>
              <option value="lte">at most</option>
              <option value="between">between</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {text("target", v.op === "between" ? "From" : "Target", "1.0", { type: "text", max: 12 })}
            {v.op === "between" && text("target_max", "To", "1.5", { type: "text", max: 12 })}
          </div>
        </>
      )}
      {d.proofType === "deliverable" && (
        <>
          <Field label="Delivered as">
            <select value={String(v.kind ?? "url")} onChange={(e) => onChange({ kind: e.target.value })} className="field text-[14px]">
              <option value="url">A link</option>
              <option value="file">A file</option>
            </select>
          </Field>
          {v.kind === "file" && (
            <Field label="File type">
              <select value={String(v.mime ?? "any")} onChange={(e) => onChange({ mime: e.target.value })} className="field text-[14px]">
                <option value="any">Any</option>
                <option value="image">Image</option>
                <option value="pdf">PDF</option>
                <option value="text">Text</option>
              </select>
            </Field>
          )}
        </>
      )}
      {d.proofType === "attestation" && (
        <>
          {text("email", "Who signs (email)", "inspector@example.com", { type: "email" })}
          {text("name", "Their name (optional)", "Ada Obi", { max: 80 })}
          {text("statement", "What they confirm", "The new circuit was wired to code before the wall was closed.", { max: 400, wide: true })}
        </>
      )}
    </div>
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
