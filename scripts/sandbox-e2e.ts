// Runs Trace's own engine against the real PayPal sandbox (spec sections 5 and 13).
//
//   A. The demo climax: authorize $420, capture $310 (final_capture false) for
//      three verified lines, re-prove the grout, capture the last $110 as final.
//   B. Close with dropped lines: capture one line, drop the rest, void the remainder.
//   C. Idempotency: resend a capture with its stored PayPal-Request-Id; PayPal
//      must hand back the same capture, not make a second one.
//   D. Reauthorize a partially captured authorization (section 17 open question).
//   E. Negative: capture after void, and over the authorized amount.
//
// The buyer approves each order in PayPal's own window. With
// PAYPAL_SANDBOX_BUYER_EMAIL and PAYPAL_SANDBOX_BUYER_PASSWORD set, headless
// Chromium does it; otherwise the script prints the link and waits for Enter.
// Photos are synthetic and the verifier is scripted: this tests the money, not
// the vision model.
//
// Every order names a sandbox business account as payee, as live jobs name the
// tradesperson: PAYPAL_SANDBOX_SELLER_MERCHANT_ID must be a sandbox seller
// already linked to the partner app (Settings > Connect PayPal does that).
//
//   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PAYPAL_PARTNER_MERCHANT_ID=... \
//   PAYPAL_SANDBOX_SELLER_MERCHANT_ID=... TEST_DATABASE_URL=... pnpm sandbox:e2e

import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import * as store from "@trace/db";
import { freshDb, makeUser } from "@trace/db/testing";
import {
  addBeforePhoto,
  authorizeJob,
  claimJob,
  confirmClose,
  createJob,
  createOrder,
  decideLine,
  issueCaptureToken,
  release,
  requestRelease,
  saveScope,
  sendScope,
  submitProof,
  type Engine,
} from "@trace/engine";
import { MemoryStorage } from "@trace/engine";
import { ScriptedVerifier, testPhoto } from "@trace/engine/testing";
import { createPayPalClient, PayPalError } from "@trace/paypal";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) {
    console.error(`set ${k}`);
    process.exit(1);
  }
  return v;
};
const paypal = createPayPalClient({
  http: process.env.PAYPAL_HTTP,
  clientId: need("PAYPAL_CLIENT_ID"),
  clientSecret: need("PAYPAL_CLIENT_SECRET"),
  baseUrl: process.env.PAYPAL_API_BASE,
  partner: { merchantId: need("PAYPAL_PARTNER_MERCHANT_ID"), bnCode: process.env.PAYPAL_BN_CODE },
});
const seller = need("PAYPAL_SANDBOX_SELLER_MERCHANT_ID");
if (!(process.env.PAYPAL_API_BASE ?? "sandbox").includes("sandbox")) {
  console.error("sandbox only");
  process.exit(1);
}
need("TEST_DATABASE_URL");

const db = await freshDb();
const verifier = new ScriptedVerifier();
const e: Engine = {
  db,
  paypal,
  storage: new MemoryStorage(),
  verifier,
  settings: { webhookId: "unused", demoMode: false, confidenceThreshold: 0.8, brandName: "Trace sandbox test" },
  now: () => new Date(),
  log: { info() {}, warn: (m, d) => console.warn("  warn", m, d ?? ""), error: (m, d) => console.error("  error", m, d ?? "") },
};

const ANCHOR = { lat: 6.4541, lng: 3.3947, accuracyM: 8 };
const DEVICE = "sandbox-device";
const acc = (show: string, notShow: string) => ({ criterion: show, must_show: [show], must_not_show: [notShow], framing: "Same angle" });
const BATHROOM = [
  { code: "L1", title: "Fix dripping tap", priceCents: 12000, acceptance: acc("tap closed with a dry spout", "water drops at the spout"), verifiableByPhoto: true },
  { code: "L2", title: "Reseal bath edge", priceCents: 9000, acceptance: acc("continuous white sealant bead", "gaps or mould in the bead"), verifiableByPhoto: true },
  { code: "L3", title: "Refit towel rail", priceCents: 10000, acceptance: acc("rail level and fixed at both ends", "loose bracket"), verifiableByPhoto: true },
  { code: "L4", title: "Regrout shower wall", priceCents: 11000, acceptance: acc("continuous grout in every joint", "visible cracks in the grout"), verifiableByPhoto: true },
];

const evidence: Record<string, unknown> = { started: new Date().toISOString(), base: process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com" };
const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
}

// ---------- buyer approval ----------

async function approve(orderId: string): Promise<void> {
  const order = await paypal.getOrder(orderId);
  const link = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!link) throw new Error(`order ${orderId} has no approval link`);
  const email = process.env.PAYPAL_SANDBOX_BUYER_EMAIL;
  const password = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD;
  if (!email || !password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`  approve as the sandbox buyer: ${link}`);
    await rl.question("  press Enter once approved ");
    rl.close();
    return;
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(link, { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(email);
    const next = page.locator("#btnNext");
    if (await next.isVisible().catch(() => false)) await next.click();
    await page.locator("#password").fill(password);
    await page.locator("#btnLogin").click();
    // The review page's submit button has changed names over time.
    const submit = page.locator('[data-testid="submit-button-initial"], #payment-submit-btn, button:has-text("Continue"), button:has-text("Agree")').first();
    await submit.waitFor({ timeout: 45_000 });
    await submit.click();
    await page.waitForURL((u) => !u.hostname.includes("paypal.com") || u.searchParams.has("token") && u.pathname.includes("return"), { timeout: 45_000 }).catch(() => {});
    // The order flips to APPROVED once the buyer confirms.
    for (let i = 0; i < 20; i++) {
      if ((await paypal.getOrder(orderId)).status === "APPROVED") return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("order never became APPROVED");
  } catch (err) {
    await mkdir("scripts/evidence", { recursive: true });
    await page.screenshot({ path: `scripts/evidence/approval-failed-${orderId}.png`, fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

// ---------- the Trace flow ----------

async function heldJob(label: string) {
  const trades = await makeUser(db, "trades");
  // The seller's real state at PayPal, linked to this throwaway tradesperson.
  const s = await paypal.sellerStatus(seller);
  await store.setPayee(db, trades, { merchantId: seller, receivable: s.paymentsReceivable, emailConfirmed: s.emailConfirmed, permissions: s.permissionsGranted });
  const home = await makeUser(db, "home");
  const email = (await db.query<{ email: string }>("select email from auth.users where id = $1", [home])).rows[0]!.email;
  const job = await createJob(e, { tradesId: trades, homeownerEmail: email, address: `Sandbox ${label}`, deviceId: DEVICE });
  await addBeforePhoto(e, { jobId: job.id, tradesId: trades, photo: await testPhoto(), gps: ANCHOR, deviceId: DEVICE });
  await saveScope(e, job.id, trades, BATHROOM);
  await sendScope(e, job.id, trades);
  await claimJob(e, job.id, { id: home, email });
  const { orderId } = await createOrder(e, job.id, home);
  await approve(orderId);
  const auth = await authorizeJob(e, job.id, orderId, home);
  const payee = (await paypal.getOrder(orderId)).purchase_units?.[0]?.payee?.merchant_id;
  if (payee !== seller) throw new Error(`order ${orderId} pays ${payee ?? "the platform"}, expected the seller ${seller}`);
  const lines = Object.fromEntries((await store.getLines(db, job.id)).map((l) => [l.code, l]));
  console.log(`  [${label}] order ${orderId}, authorization ${auth.paypal_auth_id} for $${auth.amount_cents / 100}`);
  return { jobId: job.id, trades, home, lines, auth, orderId };
}

async function prove(h: Awaited<ReturnType<typeof heldJob>>, code: string) {
  const line = h.lines[code]!;
  const { token } = await issueCaptureToken(e, line.id, h.trades, DEVICE);
  return submitProof(e, { lineId: line.id, tradesId: h.trades, photo: await testPhoto(), deviceId: DEVICE, gps: ANCHOR, token });
}

async function run(name: string, fn: () => Promise<void>) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (err) {
    check(name, false, err instanceof PayPalError ? `${err.status} ${err.issues.join(",") || err.errorName} debug_id=${err.debugId}` : String(err));
  }
}

await run("A. $310 released, $110 held, then the final $110", async () => {
  const h = await heldJob("A");
  verifier.script.set(h.lines.L4!.id, [
    {
      checks: [
        { check: "continuous grout in every joint", kind: "must_show", satisfied: true, observation: "joints filled" },
        { check: "visible cracks in the grout", kind: "must_not_show", satisfied: false, observation: "crack above the soap dish" },
      ],
    },
  ]);
  for (const c of ["L1", "L2", "L3", "L4"]) await prove(h, c);
  await requestRelease(e, h.jobId, h.trades);
  for (const c of ["L1", "L2", "L3"]) await decideLine(e, h.lines[c]!.id, h.home, { approve: true });
  const r1 = await release(e, h.jobId);
  check("partial capture", r1.kind === "captured" && r1.amountCents === 31000, JSON.stringify(r1));
  const a1 = await paypal.getAuthorization(h.auth.paypal_auth_id);
  check("authorization after partial", a1.status === "PARTIALLY_CAPTURED", a1.status);

  await prove(h, "L4");
  await requestRelease(e, h.jobId, h.trades);
  await decideLine(e, h.lines.L4!.id, h.home, { approve: true });
  const r2 = await release(e, h.jobId);
  check("final capture", r2.kind === "captured" && r2.amountCents === 11000, JSON.stringify(r2));
  const a2 = await paypal.getAuthorization(h.auth.paypal_auth_id);
  check("authorization after final", a2.status === "CAPTURED", a2.status);
  const job = await store.mustGetJob(db, h.jobId);
  check("job completed", job.status === "COMPLETED", job.status);
  const caps = (await db.query<store.CaptureRow>("select * from captures order by created_at")).rows.filter((c) => c.line_ids.some((id) => Object.values(h.lines).some((l) => l.id === id)));
  evidence.A = { order: h.orderId, authorization: h.auth.paypal_auth_id, captures: caps.map((c) => ({ id: c.paypal_capture_id, cents: c.amount_cents, final: c.final, status: c.status })) };

  // C. Resend the first capture with its stored request ID.
  const first = caps[0]!;
  const again = await paypal.captureAuthorization(
    h.auth.paypal_auth_id,
    { amountCents: first.amount_cents, currency: "USD", invoiceId: first.invoice_id, finalCapture: first.final },
    first.request_id,
  );
  check("C. same request ID returns the same capture", again.id === first.paypal_capture_id, `${again.id} vs ${first.paypal_capture_id}`);
});

await run("B. close with dropped lines voids the remainder", async () => {
  const h = await heldJob("B");
  await prove(h, "L1");
  await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
  const r = await release(e, h.jobId);
  check("capture one line", r.kind === "captured" && r.amountCents === 12000, JSON.stringify(r));
  const drop = ["L2", "L3", "L4"].map((c) => h.lines[c]!.id);
  await confirmClose(e, h.jobId, h.trades, drop);
  const out = await confirmClose(e, h.jobId, h.home, drop);
  check("close voided", out.kind === "closed" && out.voided, JSON.stringify(out));
  const a = await paypal.getAuthorization(h.auth.paypal_auth_id);
  check("authorization voided at PayPal", a.status === "VOIDED", a.status);

  // E. Negative cases on the voided hold.
  const err = await paypal
    .captureAuthorization(h.auth.paypal_auth_id, { amountCents: 100, currency: "USD", invoiceId: `${h.jobId}-neg`, finalCapture: false }, randomUUID())
    .then(() => null, (x) => x);
  check("E. capture after void is refused", err instanceof PayPalError, err instanceof PayPalError ? `${err.status} ${err.issues.join(",")}` : "accepted!");
  evidence.B = { order: h.orderId, authorization: h.auth.paypal_auth_id, captureAfterVoid: err instanceof PayPalError ? err.issues : null };
});

await run("D. reauthorize after a partial capture, and E. over-capture", async () => {
  const h = await heldJob("D");
  await prove(h, "L1");
  await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
  await release(e, h.jobId);
  const over = await paypal
    .captureAuthorization(h.auth.paypal_auth_id, { amountCents: 42000, currency: "USD", invoiceId: `${h.jobId}-over`, finalCapture: false }, randomUUID())
    .then((c) => c, (x) => x);
  // PayPal allows up to 115% (or +$75) of an authorization in some accounts; Trace never asks for more than 100%.
  check("E. capture over the remaining amount", over instanceof PayPalError, over instanceof PayPalError ? `${over.status} ${over.issues.join(",")}` : `accepted ${JSON.stringify(over)}`);
  const re = await paypal.reauthorize(h.auth.paypal_auth_id, { cents: 30000, currency: "USD" }, randomUUID()).then((a) => a, (x) => x);
  const detail = re instanceof PayPalError ? `${re.status} ${re.issues.join(",") || re.errorName}` : `new authorization ${re.id} ${re.status}`;
  // Inside the 3-day honor period PayPal is expected to refuse; the answer is the evidence.
  check("D. reauthorize answered (record, not pass/fail)", true, detail);
  evidence.D = { authorization: h.auth.paypal_auth_id, reauthorize: detail, overCapture: over instanceof PayPalError ? over.issues : "accepted" };
  const all = ["L2", "L3", "L4"].map((c) => h.lines[c]!.id);
  await confirmClose(e, h.jobId, h.trades, all);
  await confirmClose(e, h.jobId, h.home, all);
});

evidence.finished = new Date().toISOString();
evidence.results = results;
await mkdir("scripts/evidence", { recursive: true });
const file = `scripts/evidence/sandbox-${evidence.started!.toString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
await writeFile(file, JSON.stringify(evidence, null, 2));
await db.end();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Evidence: ${file}`);
process.exit(failed.length ? 1 : 0);
