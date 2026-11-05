"use client";

// Cloudflare Turnstile, the bot check in front of sign-ins, when it is set up
// (NEXT_PUBLIC_TURNSTILE_SITE_KEY here, and the secret in Supabase's Attack
// Protection). Supabase then refuses a sign-in without a fresh token. Without
// a site key there's no widget and sign-ins go through as before.

import { useCallback, useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void; appearance?: string; size?: string }): string;
      reset(id: string): void;
    };
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("The bot check couldn't load. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The widget, and the token it gives. `token` is "" with no site key (no check
 * needed), null while the check runs. `reset` asks for a new one: a token works once.
 */
export function useTurnstile(): { enabled: boolean; token: string | null; widget: React.ReactNode; reset: () => void; error: string | null } {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(SITE_KEY ? null : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let live = true;
    loadScript()
      .then(() => {
        if (!live || !box.current || !window.turnstile || id.current) return;
        id.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          callback: (t) => setToken(t),
          "expired-callback": () => setToken(null),
          "error-callback": () => setError("The bot check failed. Reload the page and try again."),
        });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const reset = useCallback(() => {
    if (!SITE_KEY) return;
    setToken(null);
    if (id.current && window.turnstile) window.turnstile.reset(id.current);
  }, []);

  return { enabled: !!SITE_KEY, token, widget: SITE_KEY ? <div ref={box} className="mt-4 empty:hidden" /> : null, reset, error };
}
