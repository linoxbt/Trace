"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function ProfileForm({ name, email }: { name: string; email: string | null }) {
  const router = useRouter();
  const [n, setN] = useState(name);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty = n.trim() !== name;

  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        setError(null);
        try {
          await api("/api/me", { method: "PATCH", json: { displayName: n.trim() } });
          setState("saved");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setState("idle");
        }
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-ink-2">Your name</span>
          <input value={n} onChange={(e) => { setN(e.target.value); setState("idle"); }} maxLength={80} required className="field" />
          <span className="text-[12px] text-faint">Shown to the other person on a job.</span>
        </label>
        <label className="grid gap-2">
          <span className="text-[13px] font-medium text-ink-2">Sign-in email</span>
          <input value={email ?? "Guest"} disabled className="field opacity-70" />
          <span className="text-[12px] text-faint">Scopes sent to this email appear in your jobs.</span>
        </label>
      </div>
      {error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}
      <div className="flex items-center gap-3">
        <button disabled={!dirty || state === "saving"} className="press h-10 rounded-full bg-violet px-5 text-[14px] font-semibold text-white disabled:opacity-40">
          {state === "saving" ? "Saving…" : "Save changes"}
        </button>
        {state === "saved" && !dirty && <span className="text-[13px] font-medium text-ok">Saved</span>}
      </div>
    </form>
  );
}
