"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase-browser";

function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/jobs";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(params.get("error") ? "error" : "idle");
  const [message, setMessage] = useState(params.get("error") ? "That sign-in link has expired. Send a new one." : "");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else setState("sent");
  }

  return (
    <main className="px-5 pt-8">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-muted">We'll email you a link. No password.</p>
      {state === "sent" ? (
        <div className="mt-8 rounded-xl border border-line bg-card p-4">
          Check <span className="font-medium">{email}</span> for your sign-in link.
        </div>
      ) : (
        <form onSubmit={send} className="mt-8 flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border border-line bg-card px-4 outline-none focus:border-teal"
          />
          {state === "error" && <p className="text-sm text-bad" role="alert">{message}</p>}
          <button disabled={state === "sending"} className="mt-2 h-12 rounded-xl bg-teal font-medium text-white disabled:opacity-60">
            {state === "sending" ? "Sending…" : "Email me a link"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
