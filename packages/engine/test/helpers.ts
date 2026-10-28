import type { Acceptance } from "@trace/core";
import * as store from "@trace/db";
import {
  addBeforePhoto,
  authorizeJob,
  claimJob,
  createJob,
  createOrder,
  issueCaptureToken,
  saveScope,
  sendScope,
  submitProof,
  type ProofResult,
} from "../src/index.ts";
import { makeUser, testPhoto, type TestEngine } from "../src/testing.ts";

export const ANCHOR = { lat: 6.4541, lng: 3.3947, accuracyM: 8 };
export const DEVICE = "device-1";

const acc = (show: string, notShow: string): Acceptance => ({
  criterion: show,
  must_show: [show],
  must_not_show: [notShow],
  framing: "Same angle as the before-photo",
});

/** The demo bathroom: $420 in four lines (spec section 15). */
export const BATHROOM = [
  { code: "L1", title: "Fix dripping tap", priceCents: 12000, acceptance: acc("tap closed with a dry spout", "water drops at the spout"), verifiableByPhoto: true },
  { code: "L2", title: "Reseal bath edge", priceCents: 9000, acceptance: acc("continuous white sealant bead", "gaps or mould in the bead"), verifiableByPhoto: true },
  { code: "L3", title: "Refit towel rail", priceCents: 10000, acceptance: acc("rail level and fixed at both ends", "loose bracket"), verifiableByPhoto: true },
  { code: "L4", title: "Regrout shower wall", priceCents: 11000, acceptance: acc("continuous grout in every joint", "visible cracks in the grout"), verifiableByPhoto: true },
];

export interface Held {
  jobId: string;
  trades: string;
  home: string;
  lines: Record<string, store.LineRow>;
  authId: string;
}

export async function heldJob(e: TestEngine, opts: { lines?: typeof BATHROOM; demo?: boolean } = {}): Promise<Held> {
  const trades = await makeUser(e.db, "trades");
  const home = opts.demo ? trades : await makeUser(e.db, "home");
  const email = (await e.db.query<{ email: string }>("select email from auth.users where id = $1", [home])).rows[0]!.email;
  const job = await createJob(e, { tradesId: trades, homeownerEmail: email, address: "12 Admiralty Way, Lekki", deviceId: DEVICE, demo: !!opts.demo });
  await addBeforePhoto(e, { jobId: job.id, tradesId: trades, photo: await testPhoto(), gps: ANCHOR, deviceId: DEVICE });
  await saveScope(e, job.id, trades, opts.lines ?? BATHROOM);
  await sendScope(e, job.id, trades);
  await claimJob(e, job.id, { id: home, email });
  const { orderId } = await createOrder(e, job.id, home);
  e.paypal.approve(orderId);
  const auth = await authorizeJob(e, job.id, orderId, home);
  const rows = await store.getLines(e.db, job.id);
  return { jobId: job.id, trades, home, lines: Object.fromEntries(rows.map((l) => [l.code, l])), authId: auth.paypal_auth_id };
}

export async function prove(e: TestEngine, h: Held, code: string, opts: { photo?: Buffer; gps?: typeof ANCHOR | null } = {}): Promise<ProofResult> {
  const line = h.lines[code]!;
  const { token } = await issueCaptureToken(e, line.id, h.trades, DEVICE);
  return submitProof(e, {
    lineId: line.id,
    tradesId: h.trades,
    photo: opts.photo ?? (await testPhoto()),
    deviceId: DEVICE,
    gps: opts.gps === undefined ? ANCHOR : opts.gps,
    token,
  });
}

export async function lineStatus(e: TestEngine, h: Held): Promise<Record<string, string>> {
  return Object.fromEntries((await store.getLines(e.db, h.jobId)).map((l) => [l.code, l.status]));
}

export function failing(check: string, observation: string) {
  return (i: { acceptance: Acceptance; lineId: string }) => ({
    checks: [
      ...i.acceptance.must_show.map((c) => ({ check: c, kind: "must_show" as const, satisfied: true, observation: "visible" })),
      ...i.acceptance.must_not_show.map((c) => ({ check: c, kind: "must_not_show" as const, satisfied: c !== check, observation: c === check ? observation : "absent" })),
    ],
    confidence: 0.92,
  });
}
