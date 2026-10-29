"use client";

// The Rules screen and the rule composer (Tripwire section 10). A rule is
// written in plain words, compiled, read back by a second model that never
// saw the words, tested against past decisions, and only then saved.

import { useState } from "react";
import { api } from "@/lib/api";
import { money, when } from "@/lib/format";
import { ShieldIcon } from "./guard";

type Side = "homeowner" | "tradesperson";

interface Compiled {
  applies_to: string[];
  when: { field: string; op: string; value: unknown }[];
  effect: "require_approval" | "deny";
  approver?: "homeowner" | "tradesperson" | "both";
}

type CompileOut =
  | {
      kind: "rule";
      rule: Compiled;
      readback: string;
      backtest: { total: number; summary: string; changed: { id: number; decided_at: string; type: string; amount_cents: number; from: string; to: string }[] };
    }
  | { kind: "unsupported"; reason: string };

export interface RulesData {
  presets: { id: string; english: string; readback: string; enabled: boolean }[];
  rules: { id: string; side: Side; scope: "job" | "account"; jobId: string | null; english: string; readback: string; enabled: boolean; effect: string; createdAt: string }[];
}

const SUGGESTIONS = ["Anything over $150 needs my OK", "If the AI wasn't sure, ask me", "Never let more than $300 go in one day"];
const OUTCOME: Record<string, string> = { ALLOW: "allowed", REQUIRE_APPROVAL: "asked first", DENY: "blocked" };

export function RuleComposer(props: { side?: Side; scope: "job" | "account"; jobId?: string; compact?: boolean; onSaved: () => void }) {
  const [side, setSide] = useState<Side>(props.side ?? "homeowner");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"compile" | "save" | null>(null);
  const [out, setOut] = useState<CompileOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = { side, scope: props.scope, jobId: props.jobId ?? null };

  async function compile(english = text) {
    if (!english.trim()) return;
    setText(english);
    setBusy("compile");
    setError(null);
    setOut(null);
    try {
      setOut(await api<CompileOut>("/api/rules/compile", { json: { ...target, english } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (out?.kind !== "rule") return;
    setBusy("save");
    setError(null);
    try {
      await api("/api/rules", { json: { ...target, english: text, readback: out.readback, rule: out.rule } });
      setText("");
      setOut(null);
      props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="surface rounded-[24px] p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-soft text-violet">
          <ShieldIcon className="h-4 w-4" />
        </span>
        <h2 className="text-[17px] font-semibold tracking-tight">{props.scope === "job" ? "Add a rule for this job" : "Add a rule in your own words"}</h2>
      </div>
      {!props.compact && (
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Rules can only add a check: ask first, or block. They can never loosen the built-in ones. You&apos;ll see the rule read back before you save it.
        </p>
      )}
      {!props.side && (
        <div role="radiogroup" aria-label="Rule applies when you are" className="mt-4 inline-flex rounded-full bg-paper-2 p-1 text-[13px]">
          {(["homeowner", "tradesperson"] as Side[]).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={side === s}
              onClick={() => {
                setSide(s);
                setOut(null);
              }}
              className={`press rounded-full px-3.5 py-1.5 font-medium ${side === s ? "bg-card text-ink shadow-[0_1px_3px_rgba(26,19,37,0.15)]" : "text-muted"}`}
            >
              {s === "homeowner" ? "When I\u2019m paying" : "When I\u2019m doing the work"}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          compile();
        }}
      >
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOut(null);
          }}
          maxLength={300}
          placeholder="e.g. Anything over $150 needs my OK"
          className="field flex-1"
          aria-label="Your rule"
        />
        <button disabled={!text.trim() || !!busy} className="press btn-ink h-12 shrink-0 rounded-full px-5 text-[14px] font-medium disabled:opacity-60">
          {busy === "compile" ? "Reading…" : "Check rule"}
        </button>
      </form>
      {!out && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => compile(s)} className="press rounded-full border border-line px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-line-2">
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-3 rounded-2xl bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{error}</p>}
      {out?.kind === "unsupported" && (
        <div className="rise mt-4 rounded-2xl bg-warn-soft p-4 text-[14px] text-warn">
          <div className="font-semibold">Trace can&apos;t check that yet</div>
          <p className="mt-1 leading-relaxed">{out.reason}. Rather than guess, nothing was saved. Try saying it another way.</p>
        </div>
      )}
      {out?.kind === "rule" && (
        <div className="rise mt-4 space-y-3">
          <div className="rounded-2xl bg-paper p-4">
            <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-faint">Read back, without seeing your words</div>
            <p className="mt-1.5 text-[15px] leading-relaxed">{out.readback}</p>
            <p className="mt-2 text-[12.5px] text-muted">Save it only if this says what you meant.</p>
          </div>
          <div className="rounded-2xl bg-paper p-4">
            <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-faint">Tested against your history</div>
            <p className="mt-1.5 text-[15px] font-medium">{out.backtest.summary}</p>
            {out.backtest.changed.length > 0 && (
              <ul className="mt-2 divide-y divide-line text-[13px]">
                {out.backtest.changed.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex justify-between gap-3 py-1.5">
                    <span className="text-muted">
                      {c.type === "FINAL_CAPTURE" ? "Final release" : c.type === "CAPTURE" ? "Release" : c.type} {money(c.amount_cents)} · {when(c.decided_at)}
                    </span>
                    <span>
                      {OUTCOME[c.from]} → <span className="font-medium text-violet">{OUTCOME[c.to]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setOut(null)} className="press h-11 rounded-full border border-line bg-card text-[14px] font-medium">
              Not quite
            </button>
            <button disabled={!!busy} onClick={save} className="press btn-primary h-11 rounded-full text-[14px] font-medium disabled:opacity-60">
              {busy === "save" ? "Saving…" : "Save rule"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function RulesScreen({ initial }: { initial: RulesData }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => setData(await api<RulesData>("/api/rules"));
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-6">
        <RuleComposer scope="account" onSaved={reload} />
        <section className="surface rounded-[24px] p-5 sm:p-6">
          <h2 className="text-[17px] font-semibold tracking-tight">Your rules</h2>
          {data.rules.length === 0 ? (
            <p className="mt-2 text-[14px] text-muted">None yet. The presets and built-in checks still guard every release.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {data.rules.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium">&ldquo;{r.english}&rdquo;</div>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted">{r.readback}</p>
                    <p className="mt-1 text-[12px] text-faint">
                      As the {r.side} · {r.scope === "job" ? "one job" : "every job"} · {r.effect === "deny" ? "blocks" : "asks first"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Toggle on={r.enabled} label={`Rule ${r.english}`} onChange={(on) => run(() => api(`/api/rules/${r.id}`, { method: "PATCH", json: { enabled: on } }))} />
                    <button onClick={() => run(() => api(`/api/rules/${r.id}`, { method: "DELETE" }))} className="press h-8 rounded-full px-2.5 text-[12.5px] text-bad hover:bg-bad-soft">
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-3 rounded-2xl bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{error}</p>}
        </section>
      </div>
      <aside className="flex flex-col gap-6">
        <section className="surface rounded-[24px] p-5">
          <h2 className="text-[16px] font-semibold tracking-tight">Presets</h2>
          <p className="mt-1 text-[13px] text-muted">On by default for jobs where you&apos;re paying.</p>
          <ul className="mt-3 space-y-3">
            {data.presets.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-medium">{p.english}</div>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{p.readback}</p>
                </div>
                <Toggle on={p.enabled} label={p.english} onChange={(on) => run(() => api(`/api/rules/presets/${p.id}`, { method: "PATCH", json: { enabled: on } }))} />
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-[24px] bg-paper-2 p-5 text-[13px] leading-relaxed text-ink-2">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldIcon /> Always on, whatever you set
          </div>
          <p className="mt-1.5 text-muted">
            Never more than the hold. Only approved lines are paid. Nothing moves during a dispute or once the hold has lapsed. Text aimed at the AI needs your OK. AI agents never move money. Refunds need both of
            you.
          </p>
        </section>
      </aside>
    </div>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`press relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${on ? "bg-violet" : "bg-line-2"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-300 ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}
