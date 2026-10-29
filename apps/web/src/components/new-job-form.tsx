"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, JOB_CATEGORIES, type JobCategory } from "@trace/core/categories";
import { api, deviceId } from "@/lib/api";
import { wordsFor } from "@/lib/words";
import { CategoryIcon } from "./category-icon";

export function NewJobForm({ initialCategory = "home_repair" }: { initialCategory?: JobCategory }) {
  const router = useRouter();
  const [category, setCategory] = useState<JobCategory>(initialCategory);
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const c = CATEGORIES[category];
  const w = wordsFor(category);
  const steps = ["Job details", "Photos and scope", `${w.Client} approves`];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: string }>("/api/jobs", { json: { address, homeownerEmail: email, deviceId: deviceId(), category } });
      router.push(`/jobs/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="rise">
      <ol className="flex items-center gap-2 text-[12px]" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${i === 0 ? "bg-ink text-white" : "bg-paper-2 text-faint"}`}>{i + 1}</span>
            <span className={`hidden sm:inline ${i === 0 ? "font-medium text-ink" : "text-faint"}`}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line-2" aria-hidden />}
          </li>
        ))}
      </ol>
      <h1 className="mt-6 text-[28px] font-semibold tracking-[-0.025em] sm:text-[32px]">Start a job</h1>
      <p className="mt-2 max-w-lg text-muted">
        Next you&apos;ll photograph the starting point and write the lines a camera can check. The {w.client} gets a link to approve.
      </p>
      <form onSubmit={create} className="surface mt-6 rounded-[22px] p-5 sm:p-7">
        <fieldset>
          <legend className="text-[13px] font-medium text-ink-2">What kind of job?</legend>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {JOB_CATEGORIES.map((id) => {
              const k = CATEGORIES[id];
              const on = id === category;
              return (
                <label
                  key={id}
                  className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors ${
                    on ? "border-violet bg-violet-soft/60 shadow-[0_0_0_1px_var(--color-violet)]" : "border-line hover:border-line-2"
                  }`}
                >
                  <input type="radio" name="category" value={id} checked={on} onChange={() => setCategory(id)} className="sr-only" />
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${on ? "bg-violet text-white" : "bg-[#f1f1f5] text-ink-2"}`}>
                    <CategoryIcon id={id} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-medium">{k.label}</span>
                    <span className="block truncate text-[12.5px] text-muted">{k.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-6 grid gap-5">
          <label className="grid gap-2">
            <span className="text-[13px] font-medium text-ink-2">{c.place.label}</span>
            <input required minLength={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={c.place.placeholder} className="field" autoComplete="street-address" />
          </label>
          <label className="grid gap-2">
            <span className="text-[13px] font-medium text-ink-2">{w.Client}&apos;s email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`${w.client.replace(/\s+/g, "")}@example.com`} className="field" />
            <span className="text-[12px] text-faint">They&apos;ll sign in with this email to review and approve the scope.</span>
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        )}
        <button disabled={busy} className="press btn-primary mt-8 flex h-12 w-full items-center justify-center rounded-full font-medium disabled:opacity-70 sm:w-auto sm:px-8">
          {busy ? "Creating…" : "Create job"}
        </button>
      </form>
    </div>
  );
}
