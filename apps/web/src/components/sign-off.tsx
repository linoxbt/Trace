"use client";

import { useState } from "react";
import { when } from "@/lib/format";

export function SignOff(props: {
  token: string;
  signedName: string | null;
  signedAt: string | null;
  expired: boolean;
  /** The named email, masked. */
  named: string;
  signedInAs: string | null;
  matches: boolean;
}) {
  const { token, signedName, signedAt, expired } = props;
  const [name, setName] = useState("");
  const [done, setDone] = useState<{ name: string; at: string } | null>(signedName && signedAt ? { name: signedName, at: signedAt } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (done) {
    return <p className="mt-6 rounded-2xl bg-ok-soft px-4 py-3 text-[14px] text-ok">Signed by {done.name} on {when(done.at)}. Thank you.</p>;
  }
  if (expired) return <p className="mt-6 rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">This link has expired. Ask for a new one.</p>;
  const signIn = `/sign-in?next=${encodeURIComponent(`/attest/${token}`)}`;
  if (!props.matches) {
    return (
      <div className="mt-6">
        <p className="rounded-2xl bg-[#f7f7fa] px-4 py-3 text-[14px] text-ink-2">
          {props.signedInAs
            ? `You're signed in as ${props.signedInAs}. This sign-off is for ${props.named}: sign in with that email to sign it.`
            : `To sign, confirm you're ${props.named}: we'll email that address a sign-in link that brings you back here.`}
        </p>
        <a href={signIn} className="press mt-5 grid h-12 w-full place-items-center rounded-full bg-violet text-[15px] font-semibold text-white">
          {props.signedInAs ? "Sign in with another email" : "Confirm my email"}
        </a>
      </div>
    );
  }

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/attest/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? `couldn't sign (${res.status})`);
      setDone({ name: name.trim(), at: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={sign} className="mt-6">
      <label className="grid gap-2">
        <span className="text-[13px] font-medium text-ink-2">Your full name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" className="field" />
      </label>
      <p className="mt-2 text-[12px] text-faint">Signed in as {props.signedInAs}. Signing records your name, email, the time and your network address with this job.</p>
      {error && <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}
      <button disabled={busy || name.trim().length < 2} className="press mt-5 h-12 w-full rounded-full bg-violet text-[15px] font-semibold text-white disabled:opacity-50">
        {busy ? "Signing…" : "I confirm, sign off"}
      </button>
    </form>
  );
}
