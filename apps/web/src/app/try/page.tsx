"use client";

// "Try the demo job": a private copy of the demo bathroom for this visitor, no
// sign-up. A guest session is created if needed, then the job opens.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase-browser";

const STEPS = ["Starting a guest session", "Copying the demo job", "Opening it"];

export default function TryDemo() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data } = await sb.auth.getSession();
        if (!data.session) {
          const { error: e } = await sb.auth.signInAnonymously();
          if (e) throw new Error(/disabled/i.test(e.message) ? "Guest sessions are switched off on this server, so the demo needs an email sign-in for now." : e.message);
        }
        setStep(1);
        const { id } = await api<{ id: string }>("/api/demo/job", { json: {} });
        setStep(2);
        router.replace(`/jobs/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f6f9] px-4">
      <div className="w-full max-w-md rounded-[22px] border border-[#ebebf0] bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <Logo size={26} />
        <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.02em]">Your demo job</h1>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
          A private copy of a $420 bathroom repair. You play both sides: approve the hold with a PayPal sandbox account, prove each line with sample photos, and release the money.
        </p>
        {error ? (
          <div className="mt-6">
            <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-[13.5px] text-bad">{error}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/sign-in?next=/try" className="press inline-flex h-10 items-center rounded-full bg-violet px-5 text-[14px] font-semibold text-white">Sign in with email</Link>
              <Link href="/demo" className="press inline-flex h-10 items-center rounded-full bg-[#f1f1f5] px-5 text-[14px] font-semibold">Watch the walkthrough</Link>
            </div>
          </div>
        ) : (
          <ol className="mt-6 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-[14.5px]">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${i < step ? "bg-ok text-white" : i === step ? "bg-violet text-white" : "bg-[#f1f1f5] text-faint"}`}>
                  {i < step ? "✓" : i === step ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : i + 1}
                </span>
                <span className={i <= step ? "text-ink" : "text-faint"}>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
