"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, deviceId } from "@/lib/api";

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
    <main className="px-5 pb-10 pt-6">
      <Link href="/jobs" className="text-sm text-muted">← Jobs</Link>
      <h1 className="mt-6 text-2xl font-semibold">New job</h1>
      <p className="mt-2 text-muted">Next you'll photograph the problem and write the lines a camera can check.</p>
      <form onSubmit={create} className="mt-8 flex flex-col gap-4">
        <Field label="Address" id="address">
          <input id="address" required minLength={3} value={address} onChange={(e) => setAddress(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-card px-4 outline-none focus:border-teal" />
        </Field>
        <Field label="Homeowner's email" id="email">
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-card px-4 outline-none focus:border-teal" />
        </Field>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <button disabled={busy} className="mt-2 h-12 rounded-xl bg-teal font-medium text-white disabled:opacity-60">
          {busy ? "Creating…" : "Create job"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
