"use client";

// Settings: link the PayPal account a tradesperson is paid into. Money for
// their jobs settles there directly; Trace never holds it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { IconCheck, IconWallet } from "./icons";
import { IconCircle } from "./ui";

export interface PayeeView {
  state: "none" | "pending" | "ready";
  merchantId: string | null;
  receivable: boolean;
  emailConfirmed: boolean;
  permissions: boolean;
}

const FLASH: Record<string, { tone: "ok" | "warn" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "PayPal is connected. Payments for your jobs now go straight to your account." },
  pending: { tone: "warn", text: "PayPal is linked, but it isn't ready to take payments yet. See what's left below." },
  unfinished: { tone: "warn", text: "PayPal sign-up wasn't finished. Start again whenever you're ready." },
  error: { tone: "bad", text: "We couldn't check your PayPal account just now. Try “Check again” in a moment." },
};

export function GetPaid({ initial, flash }: { initial: PayeeView; flash?: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState<null | "connect" | "check" | "disconnect">(null);
  const [error, setError] = useState<string | null>(null);
  const note = flash ? FLASH[flash] : undefined;

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/api/paypal/connect", { json: {} });
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    setError(null);
    try {
      setS(await api<PayeeView>("/api/paypal/status", { json: {} }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!confirm("Unlink this PayPal account? You won't be able to send new scopes until you connect one again. Jobs already approved keep paying this account.")) return;
    setBusy("disconnect");
    setError(null);
    try {
      await api("/api/paypal/connect", { method: "DELETE" });
      setS({ state: "none", merchantId: null, receivable: false, emailConfirmed: false, permissions: false });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const todo = [
    !s.emailConfirmed && "Confirm your email address with PayPal (check your inbox for PayPal's message).",
    !s.receivable && "PayPal hasn't enabled payments on the account yet. This usually clears once sign-up is complete.",
    !s.permissions && "Allow Trace to take payments for you. Continue sign-up and accept the permissions.",
  ].filter(Boolean) as string[];

  return (
    <div className="px-5 pb-6 pt-1 sm:px-6">
      {note && (
        <p role="status" className={`mb-4 rounded-xl px-3 py-2 text-[13px] ${note.tone === "ok" ? "bg-ok-soft text-ok" : note.tone === "warn" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>
          {note.text}
        </p>
      )}

      <div className="flex items-start gap-3.5">
        <IconCircle tone={s.state === "ready" ? "green" : s.state === "pending" ? "amber" : "violet"} size={44}>
          {s.state === "ready" ? <IconCheck className="h-5 w-5" /> : <IconWallet className="h-5 w-5" />}
        </IconCircle>
        <div className="min-w-0 flex-1">
          <div className="text-[15.5px] font-semibold">
            {s.state === "ready" ? "PayPal connected" : s.state === "pending" ? "Finish setting up PayPal" : "Get paid straight into your PayPal"}
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            {s.state === "ready"
              ? "When a line is approved, its payment lands in your PayPal business account. Move it to your bank from PayPal whenever you like."
              : "Connect the PayPal business account you want to be paid into. Each approved line pays you there directly; Trace never holds the money. You need this before you can send a scope."}
          </p>
          {s.state === "ready" && s.merchantId && <div className="mt-2 text-[12.5px] text-faint">PayPal merchant ID ····{s.merchantId.slice(-4)}</div>}
        </div>
      </div>

      {s.state === "pending" && todo.length > 0 && (
        <ul className="mt-4 space-y-2 rounded-2xl bg-[#f7f7fa] p-4 text-[13.5px] text-ink-2">
          {todo.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              {t}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-4 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {s.state !== "ready" && (
          <button onClick={connect} disabled={!!busy} className="press inline-flex h-10 items-center rounded-full bg-violet px-5 text-[14px] font-semibold text-white hover:bg-violet-deep disabled:opacity-50">
            {busy === "connect" ? "Opening PayPal…" : s.state === "pending" ? "Continue sign-up" : "Connect PayPal"}
          </button>
        )}
        {s.state === "pending" && (
          <button onClick={check} disabled={!!busy} className="press inline-flex h-10 items-center rounded-full bg-[#f1f1f5] px-5 text-[14px] font-semibold text-ink hover:bg-[#e9e9ef] disabled:opacity-50">
            {busy === "check" ? "Checking…" : "Check again"}
          </button>
        )}
        {s.state !== "none" && (
          <button onClick={disconnect} disabled={!!busy} className={`inline-flex h-10 items-center rounded-full text-[13.5px] font-medium text-muted hover:text-bad disabled:opacity-50 ${s.state === "ready" ? "px-0" : "px-3"}`}>
            {busy === "disconnect" ? "Unlinking…" : "Disconnect"}
          </button>
        )}
      </div>
    </div>
  );
}
