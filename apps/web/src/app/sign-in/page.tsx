"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase-browser";

function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/jobs";
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
      setMessage(err instanceof Error ? err.message : "Couldn't send the link. Try again.");
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside className="grain relative hidden overflow-hidden bg-night p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="gridlines-dark pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(91,47,214,0.5),transparent)] blur-2xl" />
        <div className="relative">
          <Logo dark />
        </div>
        <div className="relative">
          <p className="display max-w-md text-[56px] leading-[0.98]">
            Money that moves <span className="italic text-lilac">when the work does.</span>
          </p>
          <div className="surface-dark mt-10 max-w-sm rounded-2xl p-5">
            {[
              ["Authorized", "$420.00", "text-white"],
              ["Captured · 3 lines verified", "$310.00", "text-lilac"],
              ["Still held · grout to redo", "$110.00", "text-white/70"],
            ].map(([k, v, c]) => (
              <div key={k} className="flex items-center justify-between border-b border-white/10 py-3 last:border-0">
                <span className="text-[14px] text-white/65">{k}</span>
                <span className={`num text-[15px] font-semibold ${c}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-[13px] text-white/40">Sandbox demo. No real money moves.</p>
      </aside>

      {/* Form */}
      <main className="relative flex flex-col px-5 py-8 sm:px-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_70%_80%_at_50%_-10%,rgba(198,181,255,0.4),transparent)] lg:hidden" />
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          {state === "sent" ? (
            <div className="rise text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet-soft text-violet">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <rect x="3" y="5.5" width="18" height="13" rx="2" />
                  <path d="m3.5 7 8.5 6 8.5-6" />
                </svg>
              </div>
              <h1 className="mt-6 text-[28px] font-semibold tracking-tight">Check your inbox</h1>
              <p className="mt-2 text-muted">
                We sent a sign-in link to <span className="font-medium text-ink">{email}</span>. It works once and expires soon.
              </p>
              <button onClick={() => setState("idle")} className="press mt-8 text-[14px] font-medium text-violet">
                Use a different email
              </button>
            </div>
          ) : (
            <div className="rise">
              <h1 className="display text-[44px] leading-none">Sign in to Trace</h1>
              <p className="mt-2 text-muted">We&apos;ll email you a link. No password to remember.</p>
              <form onSubmit={send} className="mt-10">
                <label className="text-[13px] font-medium text-ink-2" htmlFor="email">
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
                  className="field mt-2"
                />
                {state === "error" && (
                  <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad" role="alert">
                    {message}
                  </p>
                )}
                <button disabled={state === "sending"} className="press btn-primary mt-5 flex h-12 w-full items-center justify-center rounded-full font-medium disabled:opacity-70">
                  {state === "sending" ? <Spinner /> : "Email me a link"}
                </button>
              </form>
              <p className="mt-8 text-[13px] leading-relaxed text-faint">
                Homeowners: sign in with the email the job was sent to and it will be waiting for you.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-label="Sending" />;
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
