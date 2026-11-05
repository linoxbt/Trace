// The proof types beside the single photo (spec section 6.2): video, document,
// reading, deliverable and attestation. Each adapter runs its own deterministic
// checks and hands the model's observation to the same verdict policy as a
// photo, so capture math and the guard never see the difference. Checks that
// code can make (a clip's length, a document's total and date, a reading
// against its target, a link's status, a file used twice) are integrity
// checks here; the model only reports what it saw.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import {
  CAPTURE_TOKEN_TTL_S,
  CLIP_MAX_S,
  CLIP_MIN_S,
  decideVerdict,
  evaluateIntegrity,
  hamming,
  inJobWindow,
  MAX_PROOF_FILE_BYTES,
  nextJobStatus,
  nextLineStatus,
  proofIntegrity,
  readingMeets,
  readingsAgree,
  readingTarget,
  SAME_IMAGE_HAMMING,
  VIDEO_FRAMES,
  type DeliverableSpec,
  type DocumentSpec,
  type IntegrityReport,
  type ProofCheck,
  type ReadingSpec,
  type Verdict,
} from "@trace/core";
import * as store from "@trace/db";
import { assertDemoBudget } from "./demo-budget.ts";
import type { Engine } from "./deps.ts";
import { badRequest, conflict, EngineError, forbidden } from "./errors.ts";
import { dHash, maxCellDiff, normalizePhoto } from "./image.ts";
import { TokenRejected, type ProofResult } from "./proof.ts";
import { photoPath } from "./storage.ts";
import type { ProofInspectInput, ProofObservation } from "./verifier.ts";

const PROVABLE_JOB = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];
const PROVABLE_LINE = ["PENDING", "PROVING", "FAILED", "FLAGGED"];

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const proofPath = (jobId: string, id: string, ext: string) => `job/${jobId}/proof/${id}.${ext}`;

interface Ctx {
  job: store.JobRow;
  line: store.LineRow;
}

/** Load a line to prove with `type`, check who and when, and move it to PROVING. */
async function begin(e: Engine, lineId: string, tradesId: string, type: store.LineRow["proof_type"], opts: { token?: string; sample?: boolean } = {}): Promise<Ctx> {
  const line = await store.getLine(e.db, lineId);
  if (!line) throw new EngineError("not_found", "line not found", 404);
  const job = await store.mustGetJob(e.db, line.job_id);
  if (job.trades_id !== tradesId) throw forbidden();
  if (!PROVABLE_JOB.includes(job.status)) throw conflict("not_held", "work can be proved once the money is held");
  if (line.proof_type !== type) throw conflict("wrong_proof_type", `${line.code} is proved by ${line.proof_type}, not ${type}`);
  if (job.demo) await assertDemoBudget(e, tradesId);
  const camera = type === "video" || type === "reading";
  if (camera && !opts.sample) {
    if (line.status !== "PROVING") throw conflict("not_proving", "open the camera on this line first");
    if (!opts.token) throw new TokenRejected();
    const ok = await store.consumeCaptureToken(e.db, { token: opts.token, lineId: line.id, userId: tradesId, now: e.now(), ttlS: CAPTURE_TOKEN_TTL_S });
    if (!ok) throw new TokenRejected();
  } else {
    if (opts.sample && !job.demo) throw forbidden("sample proof is for the demo job only");
    if (!PROVABLE_LINE.includes(line.status)) throw conflict("not_provable", `${line.code} is ${line.status}`);
    if (line.status !== "PROVING") await store.updateLine(e.db, line.id, { status: nextLineStatus(line.status, "TOKEN_ISSUED") });
  }
  return { job, line: (await store.getLine(e.db, line.id))! };
}

/** Record the verdict and move the line on, as a photo proof does. */
async function finish(
  e: Engine,
  c: Ctx,
  r: { decision: { verdict: Verdict; reasons: string[] }; observation: ProofObservation | null; integrity: IntegrityReport; photoId: string | null; proofItemId: string | null; model: string; sample: boolean; data?: Record<string, unknown> },
): Promise<ProofResult> {
  await e.db.tx(async (q) => {
    const j = await store.mustGetJob(q, c.job.id, { lock: true });
    const locked = await store.getLine(q, c.line.id, { lock: true });
    if (!locked || locked.status !== "PROVING") throw conflict("not_proving", `${c.line.code} changed while it was being checked`);
    const ev = r.decision.verdict === "VERIFIED" ? "VERDICT_VERIFIED" : r.decision.verdict === "FAILED" ? "VERDICT_FAILED" : "VERDICT_NEEDS_REVIEW";
    const steered = !!r.observation?.instructions_found;
    await store.updateLine(q, c.line.id, {
      status: nextLineStatus(locked.status, ev),
      review_due_at: null,
      flag_note: null,
      injection_flag: steered,
      injection_excerpt: steered ? r.observation!.instructions_found : null,
    });
    await store.insertVerdict(q, {
      lineId: c.line.id,
      photoId: r.photoId,
      proofItemId: r.proofItemId,
      observation: (r.observation ?? {
        line_id: c.line.code,
        same_location: "uncertain",
        recapture: "uncertain",
        checks: [],
        confidence: 0,
        homeowner_reason: r.decision.reasons.join("; ").slice(0, 200),
      }) as ProofObservation,
      verdict: r.decision.verdict,
      reasons: r.decision.reasons,
      model: r.model,
      pass: 1,
    });
    if (j.status === "AUTHORIZED") await store.updateJob(q, c.job.id, { status: nextJobStatus(j.status, "FIRST_PROOF") });
    await store.appendEvent(q, {
      jobId: c.job.id,
      actor: "system",
      type: "VERDICT",
      data: { line: c.line.code, verdict: r.decision.verdict, reasons: r.decision.reasons, sample: r.sample, proof_type: c.line.proof_type, ...r.data },
    });
  });
  return { verdict: r.decision.verdict, reasons: r.decision.reasons, photoId: r.photoId ?? r.proofItemId ?? "", integrity: r.integrity, observation: r.observation };
}

/** The model's look, or a refusal when no verifier can judge this proof type. */
async function inspect(e: Engine, input: ProofInspectInput): Promise<ProofObservation> {
  if (!e.verifier.inspectProof) throw new EngineError("verifier_unavailable", "the AI check for this proof type isn't configured yet", 503);
  return e.verifier.inspectProof(input);
}

/** Text aimed at a reviewer sends the line to a person, whatever else it shows. */
function instructionsCheck(obs: ProofObservation): ProofCheck[] {
  return obs.instructions_found ? [{ name: "instructions", result: "review", detail: `text addressed to the reviewer was ignored: "${obs.instructions_found}"` }] : [];
}

function verdictFrom(c: Ctx, obs: ProofObservation, integrity: IntegrityReport, e: Engine) {
  return decideVerdict(c.line.acceptance, obs, integrity, e.settings.confidenceThreshold);
}

/** A camera-taken image (a video's first frame, a gauge photo): the photo checks, as for a photo proof. */
async function cameraPhoto(e: Engine, c: Ctx, raw: Uint8Array, opts: { gps: ProofGps; deviceId: string | null; token?: string; sample: boolean }) {
  let jpeg: Buffer;
  try {
    jpeg = await normalizePhoto(raw);
  } catch {
    throw badRequest("bad_photo", "that file isn't a photo we can read");
  }
  const before = await store.beforePhotoFor(e.db, c.line);
  const hash = await dHash(jpeg);
  const nearest = await store.nearestOtherHamming(e.db, hash, before ? [before.id] : [], opts.sample ? { jobId: c.job.id } : {});
  const cellDiff = before && hamming(hash, before.dhash) <= SAME_IMAGE_HAMMING ? await maxCellDiff(await e.storage.get(before.storage_path), jpeg) : null;
  const report = evaluateIntegrity({
    sample: opts.sample,
    tokenValid: true,
    gps: opts.gps,
    anchor: c.job.anchor_lat != null && c.job.anchor_lng != null ? { lat: c.job.anchor_lat, lng: c.job.anchor_lng } : null,
    dhash: hash,
    // Without a before-photo, there's nothing to compare against: the no-change check is dropped below.
    beforeDhash: before?.dhash ?? hash.replace(/./g, (ch) => (ch === "0" ? "f" : "0")),
    beforeCellDiff: cellDiff,
    nearestOtherHamming: nearest,
    sameDevice: !!opts.deviceId && opts.deviceId === c.job.trades_device_id,
  });
  const checks = report.checks.filter((x) => before || x.name !== "no_change");
  const id = randomUUID();
  const path = photoPath(c.job.id, "after", id);
  await e.storage.put(path, jpeg, "image/jpeg");
  const photo = await store.insertPhoto(e.db, {
    id,
    job_id: c.job.id,
    line_id: c.line.id,
    kind: "after",
    storage_path: path,
    dhash: hash,
    lat: opts.gps?.lat ?? null,
    lng: opts.gps?.lng ?? null,
    gps_accuracy_m: opts.gps?.accuracyM ?? null,
    capture_token: opts.token ?? null,
    device_id: opts.deviceId,
    sample: opts.sample,
    taken_at: e.now(),
    integrity: { ...report, checks },
  });
  return { jpeg, photo, checks: checks as ProofCheck[], before, distanceM: report.distanceM };
}

export type ProofGps = { lat: number; lng: number; accuracyM: number } | null;

// ---------- video ----------

export async function submitVideoProof(
  e: Engine,
  input: { lineId: string; tradesId: string; frames: { atS: number; bytes: Uint8Array }[]; durationS: number; deviceId: string | null; gps: ProofGps; token?: string; sample?: boolean },
): Promise<ProofResult> {
  const c = await begin(e, input.lineId, input.tradesId, "video", { token: input.token, sample: input.sample });
  if (input.frames.length === 0) throw badRequest("no_frames", "the clip has no frames");
  const sample = !!input.sample;
  const first = await cameraPhoto(e, c, input.frames[0]!.bytes, { gps: input.gps, deviceId: input.deviceId, token: input.token, sample });
  const frames = [{ atS: input.frames[0]!.atS, jpeg: first.jpeg as Uint8Array }];
  for (const f of input.frames.slice(1, VIDEO_FRAMES)) {
    const jpeg = await normalizePhoto(f.bytes).catch(() => null);
    if (!jpeg) throw badRequest("bad_frame", "a frame of the clip couldn't be read");
    const id = randomUUID();
    await e.storage.put(proofPath(c.job.id, id, "jpg"), jpeg, "image/jpeg");
    await store.insertProofItem(e.db, { jobId: c.job.id, lineId: c.line.id, kind: "video_frame", storagePath: proofPath(c.job.id, id, "jpg"), sha256: sha256(jpeg), meta: { at_s: f.atS }, sample });
    frames.push({ atS: f.atS, jpeg });
  }
  const length: ProofCheck =
    input.durationS >= CLIP_MIN_S && input.durationS <= CLIP_MAX_S
      ? { name: "clip_length", result: "pass", detail: `${input.durationS.toFixed(1)} s clip` }
      : { name: "clip_length", result: "fail", detail: `clips run ${CLIP_MIN_S} to ${CLIP_MAX_S} seconds; this one is ${input.durationS.toFixed(1)} s` };
  const enough: ProofCheck[] = frames.length >= 4 ? [] : [{ name: "clip_length", result: "fail", detail: "too few frames from the clip" }];
  let integrity = proofIntegrity([...first.checks, length, ...enough], { sample });
  let obs: ProofObservation | null = null;
  let decision: { verdict: Verdict; reasons: string[] };
  if (integrity.status === "fail") decision = { verdict: "FAILED", reasons: integrity.checks.filter((x) => x.result === "fail").map((x) => x.detail) };
  else {
    const before = first.before ? await e.storage.get(first.before.storage_path) : null;
    obs = await inspect(e, { lineId: c.line.code, title: c.line.title, acceptance: c.line.acceptance, type: "video", spec: c.line.proof_spec, before, frames });
    integrity = proofIntegrity([...integrity.checks, ...instructionsCheck(obs)], { sample });
    decision = verdictFrom(c, obs, integrity, e);
  }
  return finish(e, c, { decision, observation: obs, integrity: { ...integrity, distanceM: first.distanceM }, photoId: first.photo.id, proofItemId: null, model: obs ? e.verifier.model : "integrity", sample, data: { frames: frames.length } });
}

// ---------- reading ----------

export async function submitReadingProof(
  e: Engine,
  input: { lineId: string; tradesId: string; photo: Uint8Array; enteredValue: number | null; deviceId: string | null; gps: ProofGps; token?: string; sample?: boolean },
): Promise<ProofResult> {
  const c = await begin(e, input.lineId, input.tradesId, "reading", { token: input.token, sample: input.sample });
  const spec = c.line.proof_spec as ReadingSpec;
  const sample = !!input.sample;
  const shot = await cameraPhoto(e, c, input.photo, { gps: input.gps, deviceId: input.deviceId, token: input.token, sample });
  let integrity = proofIntegrity(shot.checks, { sample });
  let obs: ProofObservation | null = null;
  let decision: { verdict: Verdict; reasons: string[] };
  if (integrity.status === "fail") decision = { verdict: "FAILED", reasons: integrity.checks.filter((x) => x.result === "fail").map((x) => x.detail) };
  else {
    const before = shot.before ? await e.storage.get(shot.before.storage_path) : null;
    obs = await inspect(e, { lineId: c.line.code, title: c.line.title, acceptance: c.line.acceptance, type: "reading", spec, before, photo: shot.jpeg });
    const value = obs.extracted.value;
    // Code, not the model, decides whether the number is good enough.
    const reading: ProofCheck[] =
      value === null
        ? [{ name: "reading", result: "review", detail: "the value on the gauge couldn't be read" }]
        : [
            readingMeets(spec, value)
              ? { name: "reading", result: "pass", detail: `reads ${value} ${spec.unit}; target ${readingTarget(spec)}` }
              : { name: "reading", result: "fail", detail: `reads ${value} ${spec.unit}; target ${readingTarget(spec)}` },
            ...(input.enteredValue !== null && !readingsAgree(input.enteredValue, value)
              ? [{ name: "reading" as const, result: "review" as const, detail: `entered ${input.enteredValue} ${spec.unit}, but the photo reads ${value}` }]
              : []),
          ];
    integrity = proofIntegrity([...integrity.checks, ...reading, ...instructionsCheck(obs)], { sample });
    decision = verdictFrom(c, obs, integrity, e);
  }
  return finish(e, c, {
    decision,
    observation: obs,
    integrity: { ...integrity, distanceM: shot.distanceM },
    photoId: shot.photo.id,
    proofItemId: null,
    model: obs ? e.verifier.model : "integrity",
    sample,
    data: { value: obs?.extracted.value ?? null, entered: input.enteredValue },
  });
}

// ---------- documents and files ----------

const IMAGE_MIME = /^image\/(jpeg|png|webp|heic|heif)$/;

/** A PDF stays a PDF; any image becomes a normalised JPEG. */
async function asProofFile(bytes: Uint8Array, mime: string): Promise<{ bytes: Uint8Array; mime: "application/pdf" | "image/jpeg"; ext: "pdf" | "jpg" }> {
  if (bytes.byteLength > MAX_PROOF_FILE_BYTES) throw new EngineError("too_big", "proof files are limited to 10 MB", 413);
  if (mime === "application/pdf" || Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-") {
    if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw badRequest("bad_file", "that file isn't a PDF");
    return { bytes, mime: "application/pdf", ext: "pdf" };
  }
  if (IMAGE_MIME.test(mime) || !mime) {
    const jpeg = await normalizePhoto(bytes).catch(() => null);
    if (jpeg) return { bytes: jpeg, mime: "image/jpeg", ext: "jpg" };
  }
  throw badRequest("bad_file", "send a PDF or a photo");
}

export async function submitDocumentProof(
  e: Engine,
  input: { lineId: string; tradesId: string; bytes: Uint8Array; mime: string; name: string; sample?: boolean },
): Promise<ProofResult> {
  const c = await begin(e, input.lineId, input.tradesId, "document", { sample: input.sample });
  const spec = c.line.proof_spec as DocumentSpec;
  const sample = !!input.sample;
  const file = await asProofFile(input.bytes, input.mime);
  const hash = sha256(input.bytes);
  const reused = await store.sha256UsedElsewhere(e.db, hash, c.line.id);
  const id = randomUUID();
  const path = proofPath(c.job.id, id, file.ext);
  await e.storage.put(path, file.bytes, file.mime);
  const item = await store.insertProofItem(e.db, { jobId: c.job.id, lineId: c.line.id, kind: "document", storagePath: path, sha256: hash, meta: { name: input.name.slice(0, 120), mime: file.mime }, sample });
  const base: ProofCheck[] = [
    { name: "file_type", result: "pass", detail: file.mime === "application/pdf" ? "PDF" : "photo of the document" },
    reused ? { name: "duplicate_file", result: "fail", detail: "this document was already used as proof" } : { name: "duplicate_file", result: "pass", detail: "not used before" },
  ];
  let integrity = proofIntegrity(base, { sample });
  let obs: ProofObservation | null = null;
  let decision: { verdict: Verdict; reasons: string[] };
  if (integrity.status === "fail") decision = { verdict: "FAILED", reasons: integrity.checks.filter((x) => x.result === "fail").map((x) => x.detail) };
  else {
    obs = await inspect(e, { lineId: c.line.code, title: c.line.title, acceptance: c.line.acceptance, type: "document", spec, file });
    const x = obs.extracted;
    const checks: ProofCheck[] = [];
    if (spec.total_at_most_price) {
      checks.push(
        x.total_cents === null
          ? { name: "document_total", result: "review", detail: "no total found on the document" }
          : x.total_cents <= c.line.price_cents
            ? { name: "document_total", result: "pass", detail: `total ${(x.total_cents / 100).toFixed(2)} is within the line price` }
            : { name: "document_total", result: "fail", detail: `total ${(x.total_cents / 100).toFixed(2)} is more than the line price ${(c.line.price_cents / 100).toFixed(2)}` },
      );
    }
    const inWindow = inJobWindow(x.date, c.job.created_at, e.now());
    checks.push(
      inWindow === null
        ? { name: "document_date", result: "review", detail: "no readable date on the document" }
        : inWindow
          ? { name: "document_date", result: "pass", detail: `dated ${x.date}` }
          : { name: "document_date", result: "fail", detail: `dated ${x.date}, outside this job's dates` },
    );
    integrity = proofIntegrity([...integrity.checks, ...checks, ...instructionsCheck(obs)], { sample });
    decision = verdictFrom(c, obs, integrity, e);
  }
  return finish(e, c, { decision, observation: obs, integrity, photoId: null, proofItemId: item.id, model: obs ? e.verifier.model : "integrity", sample, data: { document: item.id } });
}

// ---------- deliverables ----------

/** Private, loopback, link-local and other non-public addresses: never fetched. */
// Addresses a deliverable link may never reach: private, loopback, link-local
// (cloud metadata), shared, documentation and multicast ranges, and the IPv6
// forms that embed an IPv4 address (mapped, compatible, NAT64, 6to4, Teredo),
// which could smuggle one of those through. Two lists: Node checks an IPv4
// address against IPv4-mapped IPv6 rules too, so one list would block them all.
const PRIVATE4 = new BlockList();
const PRIVATE6 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) PRIVATE4.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) PRIVATE6.addSubnet(net, bits, "ipv6");

/** True only for an address on the public internet. Anything unparseable is not. */
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  if (!v) return false;
  return v === 4 ? !PRIVATE4.check(ip, "ipv4") : !PRIVATE6.check(ip, "ipv6");
}

export interface Fetched {
  status: number;
  finalUrl: string;
  contentType: string;
  body: Uint8Array;
}

/** A deliverable link that couldn't be read. The cause is logged, never shown: it would map the network. */
const unreachable = (msg = "the link couldn't be reached") => new EngineError("url_unreachable", msg, 422);

/** The public address to connect to for this URL's host, or a refusal. */
async function publicAddressFor(url: URL): Promise<{ address: string; family: 4 | 6 }> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(host);
  if (literal) {
    if (!isPublicAddress(host)) throw badRequest("bad_url", "that link points at a private address");
    return { address: host, family: literal as 4 | 6 };
  }
  const addrs = await lookup(host, { all: true }).catch(() => [] as { address: string; family: number }[]);
  if (!addrs.length) throw unreachable();
  if (addrs.some((a) => !isPublicAddress(a.address))) throw badRequest("bad_url", "that link points at a private address");
  const a = addrs[0]!;
  return { address: a.address, family: a.family === 6 ? 6 : 4 };
}

/**
 * GET a public URL for a deliverable. Every hop is checked before it is
 * fetched: http or https on the standard port, no credentials, and a host
 * whose addresses are all public. The connection then goes to the address
 * that was checked (DNS isn't asked twice, so it can't answer differently),
 * with the original name for TLS and the Host header, and the connected
 * peer is checked once more. Size and total time are capped.
 */
export async function fetchPublic(url: string, opts: { maxBytes?: number; timeoutMs?: number; hops?: number } = {}): Promise<Fetched> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw badRequest("bad_url", "that isn't a link");
  }
  for (let hop = 0; hop <= (opts.hops ?? 3); hop++) {
    const https = current.protocol === "https:";
    if (!https && current.protocol !== "http:") throw badRequest("bad_url", "only http and https links can be checked");
    if (current.username || current.password) throw badRequest("bad_url", "links with a username or password can't be checked");
    if (current.port && current.port !== (https ? "443" : "80")) throw badRequest("bad_url", "only links on the standard web ports can be checked");
    const target = await publicAddressFor(current);
    const left = deadline - Date.now();
    if (left <= 0) throw unreachable("the link took too long to answer");
    const res = await new Promise<{ status: number; location: string | null; contentType: string; body: Uint8Array }>((resolve, reject) => {
      const timer = setTimeout(() => req.destroy(unreachable("the link took too long to answer")), left);
      const req = (https ? httpsRequest : httpRequest)(
        {
          host: target.address,
          family: target.family,
          port: https ? 443 : 80,
          path: `${current.pathname}${current.search}`,
          method: "GET",
          servername: isIP(current.hostname.replace(/^\[|\]$/g, "")) ? undefined : current.hostname,
          headers: { Host: current.host, "User-Agent": "TraceProofCheck/1.0", Accept: "text/html,application/pdf,image/*,text/plain;q=0.9,*/*;q=0.5" },
        },
        (r) => {
          const peer = r.socket.remoteAddress;
          if (!peer || !isPublicAddress(peer)) {
            req.destroy(badRequest("bad_url", "that link points at a private address"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          r.on("data", (ch: Buffer) => {
            size += ch.length;
            if (size > maxBytes) {
              req.destroy(badRequest("too_big", "the linked file is too large to check"));
              return;
            }
            chunks.push(ch);
          });
          r.on("end", () => resolve({ status: r.statusCode ?? 0, location: r.headers.location ?? null, contentType: String(r.headers["content-type"] ?? ""), body: new Uint8Array(Buffer.concat(chunks)) }));
          r.on("error", reject);
        },
      );
      req.on("error", reject);
      req.on("close", () => clearTimeout(timer));
      req.end();
    }).catch((err: unknown) => {
      if (err instanceof EngineError) throw err;
      throw unreachable();
    });
    if (res.status >= 300 && res.status < 400 && res.location) {
      try {
        current = new URL(res.location, current);
      } catch {
        throw unreachable("the link redirects somewhere that isn't a link");
      }
      continue;
    }
    return { status: res.status, finalUrl: current.toString(), contentType: res.contentType, body: res.body };
  }
  throw unreachable("the link redirects too many times");
}

/** Visible text of an HTML page, for the model. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20_000);
}

export async function submitDeliverableProof(
  e: Engine,
  input: { lineId: string; tradesId: string; url?: string; file?: { bytes: Uint8Array; mime: string; name: string }; sample?: boolean; fetcher?: typeof fetchPublic },
): Promise<ProofResult> {
  const c = await begin(e, input.lineId, input.tradesId, "deliverable", { sample: input.sample });
  const spec = c.line.proof_spec as DeliverableSpec;
  const sample = !!input.sample;
  const checks: ProofCheck[] = [];
  let look: Omit<ProofInspectInput, "lineId" | "title" | "acceptance" | "type" | "spec"> = {};
  let stored: { bytes: Uint8Array; mime: string; ext: string };
  let meta: Record<string, unknown>;
  let hash: string;

  if (spec.kind === "url") {
    if (!input.url) throw badRequest("no_url", "paste the link to the work");
    const got = await (input.fetcher ?? fetchPublic)(input.url);
    checks.push(got.status === 200 ? { name: "url_status", result: "pass", detail: `${got.finalUrl} answered 200` } : { name: "url_status", result: "fail", detail: `${got.finalUrl} answered ${got.status}` });
    hash = sha256(got.body);
    meta = { url: input.url, final_url: got.finalUrl, status: got.status, content_type: got.contentType.slice(0, 80) };
    const type = got.contentType.toLowerCase();
    if (type.includes("pdf")) {
      look = { file: { bytes: got.body, mime: "application/pdf" }, url: got.finalUrl };
      stored = { bytes: got.body, mime: "application/pdf", ext: "pdf" };
    } else if (type.startsWith("image/")) {
      const jpeg = await normalizePhoto(got.body).catch(() => null);
      if (!jpeg) throw badRequest("bad_file", "the linked image couldn't be read");
      look = { file: { bytes: jpeg, mime: "image/jpeg" }, url: got.finalUrl };
      stored = { bytes: jpeg, mime: "image/jpeg", ext: "jpg" };
    } else {
      const raw = Buffer.from(got.body).toString("utf8");
      const text = type.includes("html") ? pageText(raw) : raw.slice(0, 20_000);
      look = { text, url: got.finalUrl };
      stored = { bytes: Buffer.from(text, "utf8"), mime: "text/plain", ext: "txt" };
    }
  } else {
    if (!input.file) throw badRequest("no_file", "attach the file");
    const f = input.file;
    if (f.bytes.byteLength > MAX_PROOF_FILE_BYTES) throw new EngineError("too_big", "proof files are limited to 10 MB", 413);
    hash = sha256(f.bytes);
    const isPdf = Buffer.from(f.bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
    const isImage = !isPdf && IMAGE_MIME.test(f.mime);
    const isText = !isPdf && !isImage && /^text\/|json|xml|csv/.test(f.mime);
    const kind = isPdf ? "pdf" : isImage ? "image" : isText ? "text" : "other";
    checks.push(
      spec.mime === "any" || spec.mime === kind
        ? { name: "file_type", result: kind === "other" ? "review" : "pass", detail: `${kind === "other" ? "a file type the AI can't read" : kind} (${f.name.slice(0, 60)})` }
        : { name: "file_type", result: "fail", detail: `expected ${spec.mime}, got ${kind}` },
    );
    meta = { name: f.name.slice(0, 120), mime: f.mime.slice(0, 80), bytes: f.bytes.byteLength };
    if (isPdf) {
      look = { file: { bytes: f.bytes, mime: "application/pdf" } };
      stored = { bytes: f.bytes, mime: "application/pdf", ext: "pdf" };
    } else if (isImage) {
      const jpeg = await normalizePhoto(f.bytes).catch(() => null);
      if (!jpeg) throw badRequest("bad_file", "that image couldn't be read");
      look = { file: { bytes: jpeg, mime: "image/jpeg" } };
      stored = { bytes: jpeg, mime: "image/jpeg", ext: "jpg" };
    } else {
      const text = Buffer.from(f.bytes).toString("utf8").slice(0, 20_000);
      look = { text };
      stored = { bytes: Buffer.from(text, "utf8"), mime: "text/plain", ext: "txt" };
    }
  }
  const reused = await store.sha256UsedElsewhere(e.db, hash, c.line.id);
  checks.push(reused ? { name: "duplicate_file", result: "fail", detail: "this deliverable was already used as proof" } : { name: "duplicate_file", result: "pass", detail: "not used before" });
  const id = randomUUID();
  const path = proofPath(c.job.id, id, stored.ext);
  await e.storage.put(path, stored.bytes, stored.mime);
  const item = await store.insertProofItem(e.db, { jobId: c.job.id, lineId: c.line.id, kind: spec.kind === "url" ? "url" : "file", storagePath: path, sha256: hash, meta, sample });

  let integrity = proofIntegrity(checks, { sample });
  let obs: ProofObservation | null = null;
  let decision: { verdict: Verdict; reasons: string[] };
  if (integrity.status === "fail") decision = { verdict: "FAILED", reasons: integrity.checks.filter((x) => x.result === "fail").map((x) => x.detail) };
  else {
    obs = await inspect(e, { lineId: c.line.code, title: c.line.title, acceptance: c.line.acceptance, type: "deliverable", spec, ...look });
    integrity = proofIntegrity([...integrity.checks, ...instructionsCheck(obs)], { sample });
    decision = verdictFrom(c, obs, integrity, e);
  }
  return finish(e, c, { decision, observation: obs, integrity, photoId: null, proofItemId: item.id, model: obs ? e.verifier.model : "integrity", sample, data: { deliverable: item.id } });
}

// ---------- attestation ----------

export const ATTESTATION_TTL_DAYS = 14;
const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * "Send for sign-off": a single-use link for the person named on the scope.
 * Only its hash is stored; the link is shown once, to the tradesperson.
 */
export async function requestAttestation(e: Engine, lineId: string, tradesId: string): Promise<{ token: string; email: string; statement: string; expiresAt: Date }> {
  const c = await begin(e, lineId, tradesId, "attestation");
  const spec = c.line.proof_spec as { email: string; statement: string };
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(e.now().getTime() + ATTESTATION_TTL_DAYS * 86_400_000);
  await e.db.tx(async (q) => {
    // One live link per line: a new one cancels any earlier, unsigned link.
    await q.query("update attestations set expires_at = $2 where line_id = $1 and signed_at is null and expires_at > $2", [c.line.id, e.now()]);
    await q.query("insert into attestations (line_id, token_hash, email, statement, expires_at) values ($1, $2, $3, $4, $5)", [c.line.id, tokenHash(token), spec.email, spec.statement, expiresAt]);
    await store.appendEvent(q, { jobId: c.job.id, actor: "tradesperson", type: "ATTESTATION_REQUESTED", data: { line: c.line.code, email: spec.email } });
  });
  return { token, email: spec.email, statement: spec.statement, expiresAt };
}

export interface AttestationView {
  address: string;
  line: string;
  lineTitle: string;
  statement: string;
  email: string;
  signedName: string | null;
  signedAt: string | null;
  expired: boolean;
}

async function attestationByToken(e: Engine, token: string): Promise<{ att: store.AttestationRow; line: store.LineRow; job: store.JobRow }> {
  const { rows } = await e.db.query<store.AttestationRow>("select * from attestations where token_hash = $1", [tokenHash(token)]);
  const att = rows[0];
  if (!att) throw new EngineError("not_found", "this sign-off link isn't valid", 404);
  const line = (await store.getLine(e.db, att.line_id))!;
  return { att, line, job: await store.mustGetJob(e.db, line.job_id) };
}

export async function attestationView(e: Engine, token: string): Promise<AttestationView> {
  const { att, line, job } = await attestationByToken(e, token);
  return {
    address: job.address,
    line: line.code,
    lineTitle: line.title,
    statement: att.statement,
    email: att.email,
    signedName: att.signed_name,
    signedAt: att.signed_at?.toISOString() ?? null,
    expired: att.expires_at.getTime() <= e.now().getTime(),
  };
}

/**
 * The named person signs. They must be signed in with the email the line
 * names (Supabase's sign-in link proves they read that inbox), and can't be
 * either side of the job, so the tradesperson can't sign their own work off.
 * Name, time and IP are recorded. The line then waits for the client's own
 * approval: a signature is evidence, never a release on its own.
 */
export async function signAttestation(e: Engine, token: string, input: { name: string; ip: string | null; signer: { id: string; email: string | null } }): Promise<ProofResult> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw badRequest("bad_name", "type your full name to sign");
  const { att, line, job } = await attestationByToken(e, token);
  if (att.signed_at) throw conflict("already_signed", "this has already been signed");
  if (att.expires_at.getTime() <= e.now().getTime()) throw conflict("expired", "this sign-off link has expired; ask for a new one");
  if (input.signer.id === job.trades_id || input.signer.id === job.homeowner_id) throw forbidden("the people on the job can't sign its sign-off; it's for the person named on the line");
  if (!input.signer.email || input.signer.email.toLowerCase() !== att.email.toLowerCase()) {
    throw forbidden(`this sign-off is for ${maskEmail(att.email)}; sign in with that email to sign it`);
  }
  if (line.status !== "PROVING") throw conflict("not_proving", `${line.code} isn't waiting for a sign-off`);
  const signedAt = e.now();
  const claimed = await e.db.query("update attestations set signed_name = $2, signed_at = $3, signed_ip = $4 where id = $1 and signed_at is null", [att.id, name, signedAt, input.ip]);
  if (!claimed.rowCount) throw conflict("already_signed", "this has already been signed");
  const unclaim = () => e.db.query("update attestations set signed_name = null, signed_at = null, signed_ip = null where id = $1", [att.id]).catch(() => {});
  const item = await store
    .insertProofItem(e.db, { jobId: job.id, lineId: line.id, kind: "attestation", meta: { attestation: att.id, name, email: att.email, signer: input.signer.id, statement: att.statement, signed_at: signedAt.toISOString(), ip: input.ip } })
    .catch(async (err) => {
      await unclaim();
      throw err;
    });
  const observation: ProofObservation = {
    line_id: line.code,
    same_location: "yes",
    recapture: "no",
    checks: [
      ...line.acceptance.must_show.map((check) => ({ check, kind: "must_show" as const, satisfied: true, observation: `attested by ${name}`.slice(0, 160) })),
      ...line.acceptance.must_not_show.map((check) => ({ check, kind: "must_not_show" as const, satisfied: true, observation: `attested by ${name}`.slice(0, 160) })),
    ],
    confidence: 1,
    homeowner_reason: `${name} signed: "${att.statement}"`.slice(0, 200),
    extracted: { value: null, unit: null, vendor: null, date: null, total_cents: null, items: [] },
    instructions_found: null,
  };
  const integrity = proofIntegrity([{ name: "signature", result: "pass", detail: `signed by ${name} (${att.email}) on ${signedAt.toISOString()}` }]);
  return finish(e, { job, line }, {
    decision: { verdict: "NEEDS_REVIEW", reasons: [`signed by ${name} (${att.email}); approve it to release payment`] },
    observation,
    integrity,
    photoId: null,
    proofItemId: item.id,
    model: "attestation",
    sample: false,
    data: { signed_by: name },
  }).catch(async (err) => {
    await unclaim();
    throw err;
  });
}

/** a•••@example.com: enough for the right person to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}•••@${domain}`;
}
