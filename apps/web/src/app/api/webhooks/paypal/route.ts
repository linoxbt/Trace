import { NextResponse, type NextRequest } from "next/server";
import { handleWebhook, WebhookRejected } from "@trace/engine";
import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/paypal: verified with PayPal against the raw body,
 * de-duplicated on event ID, then routed. An unverified webhook gets a 400 and
 * is logged; a failure while processing gets a 500 so PayPal retries.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const e = engine();
  try {
    return NextResponse.json(await handleWebhook(e, raw, (n) => req.headers.get(n)));
  } catch (err) {
    if (err instanceof WebhookRejected) {
      e.log.warn("webhook rejected", { reason: err.message });
      return NextResponse.json({ error: "rejected" }, { status: 400 });
    }
    e.log.error("webhook failed", { err: String(err) });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
