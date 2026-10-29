"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { ArrowDisc, Eyebrow, FloatDots } from "@/components/marketing/blocks";
import { ParticleHero } from "@/components/marketing/particle-hero";
import { supabaseBrowser } from "@/lib/supabase-browser";

function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const expired = !!params.get("error");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(expired ? "error" : "idle");
  const [message, setMessage] = useState(expired ? "That sign-in link has expired. Send a new one." : "");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
      setState("sent");
    } catch (err) {
      setState("error");
      const raw = err instanceof Error ? err.message : "";
      setMessage(
        /rate limit/i.test(raw)
          ? "Too many sign-in emails in the last hour. Use the newest link already in your inbox, or try again in about an hour."
          : raw || "Couldn't send the link. Try again.",
      );
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel: the hero's dot field, telling the job's story while you sign in. */}
      <aside className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <FloatDots count={20} />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative">
          <Eyebrow>Payment that follows proof</Eyebrow>
          <p className="display mt-5 max-w-lg text-[60px] leading-[0.95]">
            Money that moves <span className="text-violet">when the work does.</span>
          </p>
          <div className="mt-6 max-w-[400px]">
            <ParticleHero />
          </div>
        </div>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Sandbox demo · no real money moves</p>
      </aside>

      {/* Form */}
      <main className="relative flex flex-col px-5 py-6 sm:px-10 lg:py-3 lg:pr-3">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center py-10 lg:rounded-[36px] lg:bg-white/50">
          <div className="clay w-full max-w-[420px] rounded-[30px] p-7 sm:p-9">
            {state === "sent" ? (
              <div className="rise text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet text-white shadow-[0_12px_24px_-10px_rgb(91_47_214/0.6)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <rect x="3" y="5.5" width="18" height="13" rx="2" />
                    <path d="m3.5 7 8.5 6 8.5-6" />
                  </svg>
                </div>
                <h1 className="display mt-6 text-[32px] leading-tight">Check your inbox</h1>
                <p className="mt-2 text-muted">
                  We sent a sign-in link to <span className="font-medium text-ink">{email}</span>. It works once and expires soon.
                </p>
                <button onClick={() => setState("idle")} className="press mt-8 text-[14px] font-semibold text-violet">
                  Use a different email
                </button>
              </div>
            ) : (
              <div className="rise">
                <Eyebrow>Sign in</Eyebrow>
                <h1 className="display mt-4 text-[40px] leading-none">Welcome to Trace</h1>
                <p className="mt-3 text-muted">We&apos;ll email you a link. No password to remember.</p>
                <form onSubmit={send} className="mt-8">
                  <label className="text-[13px] font-semibold text-ink-2" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="field mt-2 bg-paper"
                  />
                  {state === "error" && (
                    <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad" role="alert">
                      {message}
                    </p>
                  )}
                  <button
                    disabled={state === "sending"}
                    className="pill press btn-ink mt-5 flex h-[52px] w-full items-center justify-between rounded-full pl-6 pr-2 font-semibold disabled:opacity-70"
                  >
                    {state === "sending" ? "Sending…" : "Email me a link"}
                    {state === "sending" ? <Spinner /> : <ArrowDisc size={36} />}
                  </button>
                </form>
                <p className="mt-6 rounded-2xl bg-paper px-4 py-3 text-[13px] leading-relaxed text-muted">
                  Homeowners: sign in with the email the job was sent to and it will be waiting for you.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return <span className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-label="Sending" />;
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
