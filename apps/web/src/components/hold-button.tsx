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
    paypal?: {
      createInstance(o: { clientId: string; components: string[]; pageType?: string; merchantId?: string; partnerAttributionId?: string }): Promise<PayPalSdk>;
    };
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

export function HoldButton(props: {
  jobId: string;
  totalCents: number;
  currency: string;
  clientId: string;
  /** The tradesperson's PayPal merchant ID: the account this payment goes to. */
  merchantId: string | null;
  bnCode: string;
  sandbox: boolean;
  onHeld: () => void;
}) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");
  const session = useRef<PayPalSession | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!props.clientId) throw new Error("PayPal isn't configured on this server.");
        await loadSdk(props.sandbox);
        const sdk = await window.paypal!.createInstance({
          clientId: props.clientId,
          components: ["paypal-payments"],
          pageType: "checkout",
          ...(props.merchantId ? { merchantId: props.merchantId } : {}),
          ...(props.bnCode ? { partnerAttributionId: props.bnCode } : {}),
        });
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
  }, [props.clientId, props.sandbox, props.currency, props.jobId, props.merchantId, props.bnCode]);

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
    <div className="surface overflow-hidden rounded-[24px]">
      <div className="p-5">
        <div className="text-[13px] font-medium text-violet">Your approval</div>
        <div className="mt-1 text-[22px] font-semibold tracking-tight">
          Approve and hold <span className="num">{money(props.totalCents, props.currency)}</span>
        </div>
        <ul className="mt-3 space-y-1.5 text-[14px] text-ink-2">
          {["PayPal holds it: nothing is charged now", "Each line is paid only after its photos pass", "Payments go straight to the tradesperson's PayPal", "Anything unfinished is released back to you"].map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line bg-paper/60 p-5">
        <div className={state === "error" && !session.current ? "" : "min-h-[45px]"}>
          {state === "loading" && <div className="h-[45px] animate-pulse rounded-full bg-line" />}
          {(state === "ready" || state === "error") && session.current && <paypal-button type="pay" onClick={start} className="block w-full" />}
          {state === "working" && (
            <p className="flex h-[45px] items-center justify-center gap-2 text-[14px] text-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-violet" /> Placing the hold with PayPal…
            </p>
          )}
          {state === "held" && <p className="flex h-[45px] items-center justify-center text-[14px] font-medium text-ok">✓ Held. Nothing charged yet.</p>}
          {state === "ineligible" && <p className="text-[14px] text-bad">PayPal isn&apos;t available for this payment.</p>}
        </div>
        {message && (
          <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
