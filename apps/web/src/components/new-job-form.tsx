"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, deviceId } from "@/lib/api";

const STEPS = ["Job details", "Photos and scope", "Homeowner approves"];

export function NewJobForm() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: string }>("/api/jobs", { json: { address, homeownerEmail: email, deviceId: deviceId() } });
      router.push(`/jobs/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="rise">
      <ol className="flex items-center gap-2 text-[12px]" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${i === 0 ? "bg-ink text-white" : "bg-paper-2 text-faint"}`}>{i + 1}</span>
            <span className={`hidden sm:inline ${i === 0 ? "font-medium text-ink" : "text-faint"}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line-2" aria-hidden />}
          </li>
        ))}
      </ol>
      <h1 className="mt-6 text-[28px] font-semibold tracking-[-0.025em] sm:text-[32px]">Start a job</h1>
      <p className="mt-2 max-w-lg text-muted">Next you&apos;ll photograph the problem and write the lines a camera can check. The homeowner gets a link to approve.</p>
      <form onSubmit={create} className="surface mt-6 rounded-[22px] p-5 sm:p-7">
        <div className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-[13px] font-medium text-ink-2">Job address</span>
            <input required minLength={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Admiralty Way, Lekki" className="field" autoComplete="street-address" />
          </label>
          <label className="grid gap-2">
            <span className="text-[13px] font-medium text-ink-2">Homeowner&apos;s email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="homeowner@example.com" className="field" />
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
