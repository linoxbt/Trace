"use client";

// The homeowner approves inside PayPal's own v6 payment session. Our server
// creates the AUTHORIZE order (amounts from the stored lines) and authorizes it
// on approve. Nothing is charged here.

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "paypal-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string };
    }
  }
}

interface PayPalSession {
  start(options: { presentationMode: string }, order: Promise<{ orderId: string }>): Promise<void>;
}
interface PayPalSdk {
  findEligibleMethods(o: { currencyCode: string }): Promise<{ isEligible(m: string): boolean }>;
  createPayPalOneTimePaymentSession(o: {
    onApprove(data: { orderId: string }): Promise<void>;
    onCancel?(data: unknown): void;
    onError?(err: unknown): void;
  }): PayPalSession;
}
declare global {
  interface Window {
    paypal?: { createInstance(o: { clientId: string; components: string[]; pageType?: string }): Promise<PayPalSdk> };
  }
}

let loading: Promise<void> | null = null;
function loadSdk(sandbox: boolean): Promise<void> {
  if (window.paypal) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = sandbox ? "https://www.sandbox.paypal.com/web-sdk/v6/core" : "https://www.paypal.com/web-sdk/v6/core";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("PayPal didn't load. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

type State = "loading" | "ready" | "ineligible" | "working" | "held" | "error";

export function HoldButton(props: { jobId: string; totalCents: number; currency: string; clientId: string; sandbox: boolean; onHeld: () => void }) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");
  const session = useRef<PayPalSession | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!props.clientId) throw new Error("PayPal isn't configured on this server.");
        await loadSdk(props.sandbox);
        const sdk = await window.paypal!.createInstance({ clientId: props.clientId, components: ["paypal-payments"], pageType: "checkout" });
        const methods = await sdk.findEligibleMethods({ currencyCode: props.currency });
        if (!live) return;
        if (!methods.isEligible("paypal")) return setState("ineligible");
        session.current = sdk.createPayPalOneTimePaymentSession({
          async onApprove({ orderId }) {
            setState("working");
            try {
              await api(`/api/jobs/${props.jobId}/authorize`, { json: { orderId } });
              setState("held");
              props.onHeld();
            } catch (e) {
              setState("error");
              setMessage(`${e instanceof Error ? e.message : String(e)} Nothing was charged.`);
            }
          },
          onCancel() {
            setState("ready");
          },
          onError() {
            setState("error");
            setMessage("PayPal couldn't finish. Nothing was charged.");
          },
        });
        setState("ready");
      } catch (e) {
        if (!live) return;
        setState("error");
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [props.clientId, props.sandbox, props.currency, props.jobId]);

  async function start() {
    if (!session.current) return;
    setMessage("");
    // The order request starts inside the click, as PayPal's popup requires.
    const order = api<{ orderId: string }>(`/api/jobs/${props.jobId}/order`, { json: {} }).then((r) => ({ orderId: r.orderId }));
    try {
      await session.current.start({ presentationMode: "auto" }, order);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-lg font-semibold">Approve and hold <span className="num">{money(props.totalCents, props.currency)}</span></div>
      <p className="mt-1 text-sm text-muted">Nothing is charged until work is verified. Each line is paid only after its photos pass.</p>
      <div className="mt-4 min-h-12">
        {state === "loading" && <div className="h-12 animate-pulse rounded-xl bg-line" />}
        {(state === "ready" || state === "error") && session.current && <paypal-button type="pay" onClick={start} className="block w-full" />}
        {state === "working" && <p className="text-sm">Placing the hold with PayPal…</p>}
        {state === "held" && <p className="text-sm font-medium text-ok">Held. Nothing charged yet.</p>}
        {state === "ineligible" && <p className="text-sm text-bad">PayPal isn't available for this payment.</p>}
      </div>
      {message && <p role="alert" className="mt-2 text-sm text-bad">{message}</p>}
    </div>
  );
}
