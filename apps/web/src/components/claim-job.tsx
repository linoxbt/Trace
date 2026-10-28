"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Logo } from "./logo";

export function ClaimJob({ jobId, address }: { jobId: string; address: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative grid min-h-dvh place-items-center px-5 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_60%_80%_at_50%_-10%,rgba(158,240,216,0.45),transparent)]" />
      <div className="rise w-full max-w-md">
        <Logo />
        <div className="surface mt-8 rounded-[28px] p-6 sm:p-8">
          <p className="text-[13px] font-medium text-teal">You&apos;ve been sent a repair job</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.025em]">{address}</h1>
          <ul className="mt-6 space-y-3 text-[15px] text-ink-2">
            {[
              "Review each line of work and its price",
              "Approve with PayPal: the money is held, not charged",
              "Each line is paid only after its photos pass",
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-paper-2 text-[12px] font-semibold">{i + 1}</span>
                {t}
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/jobs/${jobId}/claim`, { json: {} });
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setBusy(false);
              }
            }}
            className="press btn-primary mt-8 flex h-12 w-full items-center justify-center rounded-full font-medium disabled:opacity-70"
          >
            {busy ? "Opening…" : "Review the job"}
          </button>
        </div>
      </div>
    </div>
  );
}
