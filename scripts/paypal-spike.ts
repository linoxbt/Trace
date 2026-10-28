// Day-1 spike (spec section 5): run against the PayPal sandbox before any UI.
//
//   1. authorize $100, capture $60 (final_capture: false), capture $40 (final_capture: true)
//   2. authorize $100, capture $60, void the rest
//   3. authorize $100, capture $60, try to reauthorize (section 17 open question)
//
// Each run needs the buyer to approve an order in the browser. The script
// prints the approval link and waits for Enter.
//
//   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... pnpm spike:paypal

import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { authorizationOf, PayPalClient, PayPalError } from "@trace/paypal";

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
if (!id || !secret) {
  console.error("set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox)");
  process.exit(1);
}
const pp = new PayPalClient({ clientId: id, clientSecret: secret, baseUrl: process.env.PAYPAL_API_BASE });
const rl = createInterface({ input: process.stdin, output: process.stdout });

async function hold(label: string): Promise<string> {
  const run = randomUUID().slice(0, 8);
  const order = await pp.createOrder(
    { currency: "USD", invoiceId: `spike-${run}`, customId: label, description: `Trace spike: ${label}`, items: [{ code: "L1", title: "Spike line", priceCents: 10000 }] },
    `spike-order-${run}`,
  );
  const approve = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  console.log(`\n[${label}] approve as the sandbox buyer: ${approve}`);
  await rl.question("press Enter once approved ");
  const auth = authorizationOf(await pp.authorizeOrder(order.id, `spike-auth-${run}`));
  console.log(`[${label}] authorized ${auth.id} ${auth.amount?.value} ${auth.status}, expires ${auth.expiration_time}`);
  return auth.id;
}

async function step(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    const out = await fn();
    console.log(`  ok   ${label}`, out && typeof out === "object" && "status" in out ? (out as { status: string }).status : "");
    return true;
  } catch (err) {
    console.log(`  FAIL ${label}: ${err instanceof PayPalError ? `${err.status} ${err.issues.join(",") || err.errorName} (debug ${err.debugId})` : String(err)}`);
    return false;
  }
}

const cap = (cents: number, invoiceId: string, final: boolean) => ({ amountCents: cents, currency: "USD", invoiceId, finalCapture: final });
const results: Record<string, boolean> = {};

{
  const a = await hold("partial + final");
  results.partial = await step("capture $60, final_capture false", () => pp.captureAuthorization(a, cap(6000, `${a}-r1`, false), randomUUID()));
  results.final = await step("capture $40, final_capture true", () => pp.captureAuthorization(a, cap(4000, `${a}-r2`, true), randomUUID()));
  await step("authorization status", () => pp.getAuthorization(a));
}
{
  const a = await hold("partial + void");
  results.partial2 = await step("capture $60, final_capture false", () => pp.captureAuthorization(a, cap(6000, `${a}-r1`, false), randomUUID()));
  results.void = await step("void the remaining $40", () => pp.voidAuthorization(a, randomUUID()));
  await step("authorization status", () => pp.getAuthorization(a));
}
{
  const a = await hold("reauthorize after partial");
  await step("capture $60, final_capture false", () => pp.captureAuthorization(a, cap(6000, `${a}-r1`, false), randomUUID()));
  results.reauth = await step("reauthorize $40 (inside the honor period PayPal may refuse; note the issue code)", () => pp.reauthorize(a, { cents: 4000, currency: "USD" }, randomUUID()));
}

rl.close();
console.log("\nresults", results);
console.log(results.partial && results.final && results.void ? "multiple partial captures work: keep the plan" : "partial captures blocked: switch to the section 16 fallback");
