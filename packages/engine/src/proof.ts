// Flow C: issue a capture token, take the after-photo, run the integrity
// checks and the verifier, and store the verdict.

import { randomBytes, randomUUID } from "node:crypto";
import {
  CAPTURE_TOKEN_TTL_S,
  combinePasses,
  decideVerdict,
  evaluateIntegrity,
  needsSecondPass,
  nextJobStatus,
  nextLineStatus,
  type IntegrityReport,
  type LineObservation,
  type Verdict,
} from "@trace/core";
import * as store from "@trace/db";
import type { Engine } from "./deps.ts";
import { badRequest, conflict, EngineError, forbidden } from "./errors.ts";
import { cropRegion, dHash, normalizePhoto } from "./image.ts";
import { photoPath } from "./storage.ts";

const PROVABLE_JOB = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];
const PROVABLE_LINE = ["PENDING", "PROVING", "FAILED", "FLAGGED"];

/** The tradesperson opens the camera on a line: a one-time token, valid 120 s. PENDING -> PROVING. */
export async function issueCaptureToken(e: Engine, lineId: string, tradesId: string, deviceId: string | null): Promise<{ token: string; expiresAt: Date }> {
  return e.db.tx(async (q) => {
    const line = await store.getLine(q, lineId, { lock: true });
    if (!line) throw new EngineError("not_found", "line not found", 404);
    const job = await store.mustGetJob(q, line.job_id);
    if (job.trades_id !== tradesId) throw forbidden();
    if (!PROVABLE_JOB.includes(job.status)) throw conflict("not_held", "work can be proved once the money is held");
    if (!PROVABLE_LINE.includes(line.status)) throw conflict("not_provable", `${line.code} is ${line.status}`);
    const token = randomBytes(24).toString("base64url");
    const now = e.now();
    await store.issueCaptureToken(q, { token, lineId, issuedTo: tradesId, deviceId, now });
    if (line.status !== "PROVING") await store.updateLine(q, lineId, { status: nextLineStatus(line.status, "TOKEN_ISSUED") });
    return { token, expiresAt: new Date(now.getTime() + CAPTURE_TOKEN_TTL_S * 1000) };
  });
}

export interface ProofInput {
  lineId: string;
  tradesId: string;
  photo: Uint8Array;
  deviceId: string | null;
  gps: { lat: number; lng: number; accuracyM: number } | null;
  /** From issueCaptureToken. Absent only for a judge-mode sample photo. */
  token?: string;
  /** Judge mode: a sample photo instead of the camera (section 12). */
  sample?: boolean;
}

export interface ProofResult {
  verdict: Verdict;
  reasons: string[];
  photoId: string;
  integrity: IntegrityReport;
  observation: LineObservation | null;
}

export class TokenRejected extends EngineError {
  constructor() {
    super("token_rejected", "the camera session expired; open the camera again", 409);
  }
}

export async function submitProof(e: Engine, input: ProofInput): Promise<ProofResult> {
  const line = await store.getLine(e.db, input.lineId);
  if (!line) throw new EngineError("not_found", "line not found", 404);
  const job = await store.mustGetJob(e.db, line.job_id);
  if (job.trades_id !== input.tradesId) throw forbidden();
  if (!PROVABLE_JOB.includes(job.status)) throw conflict("not_held", "work can be proved once the money is held");
  const now = e.now();

  if (input.sample) {
    if (!job.demo) throw forbidden("sample photos are for the demo job only");
    if (!PROVABLE_LINE.includes(line.status)) throw conflict("not_provable", `${line.code} is ${line.status}`);
    if (line.status !== "PROVING") await store.updateLine(e.db, line.id, { status: nextLineStatus(line.status, "TOKEN_ISSUED") });
  } else {
    if (line.status !== "PROVING") throw conflict("not_proving", "open the camera on this line first");
    if (!input.token) throw new TokenRejected();
    const ok = await store.consumeCaptureToken(e.db, { token: input.token, lineId: line.id, userId: input.tradesId, now, ttlS: CAPTURE_TOKEN_TTL_S });
    if (!ok) throw new TokenRejected();
  }

  let after: Buffer;
  try {
    after = await normalizePhoto(input.photo);
  } catch {
    throw badRequest("bad_photo", "that file isn't a photo we can read");
  }
  const before = await store.beforePhotoFor(e.db, line);
  if (!before) throw conflict("no_before_photo", "this job has no before-photo");
  const hash = await dHash(after);
  const nearest = await store.nearestOtherHamming(e.db, hash, [before.id]);
  const integrity = evaluateIntegrity({
    sample: !!input.sample,
    tokenValid: true,
    gps: input.gps,
    anchor: job.anchor_lat != null && job.anchor_lng != null ? { lat: job.anchor_lat, lng: job.anchor_lng } : null,
    dhash: hash,
    beforeDhash: before.dhash,
    nearestOtherHamming: nearest,
    sameDevice: !!input.deviceId && input.deviceId === job.trades_device_id,
  });

  const photoId = randomUUID();
  const kind = line.verifiable_by_photo ? "after" : "during";
  const path = photoPath(job.id, kind, photoId);
  await e.storage.put(path, after, "image/jpeg");
  const photo = await store.insertPhoto(e.db, {
    id: photoId,
    job_id: job.id,
    line_id: line.id,
    kind,
    storage_path: path,
    dhash: hash,
    lat: input.gps?.lat ?? null,
    lng: input.gps?.lng ?? null,
    gps_accuracy_m: input.gps?.accuracyM ?? null,
    capture_token: input.token ?? null,
    device_id: input.deviceId,
    sample: !!input.sample,
    taken_at: now,
    integrity,
  });

  // Failed integrity is final without spending a model call.
  let observation: LineObservation | null = null;
  let decision: { verdict: Verdict; reasons: string[] };
  const passes: { obs: LineObservation; pass: number }[] = [];
  if (integrity.status === "fail") {
    decision = { verdict: "FAILED", reasons: integrity.checks.filter((c) => c.result === "fail").map((c) => c.detail) };
  } else {
    const beforeBytes = await e.storage.get(before.storage_path);
    const base = { lineId: line.id, title: line.title, acceptance: line.acceptance, before: beforeBytes, after };
    const first = await inspect(e, base);
    passes.push({ obs: first, pass: 1 });
    observation = first;
    decision = decideVerdict(line.acceptance, first, integrity, e.settings.confidenceThreshold);
    if (needsSecondPass(first, e.settings.confidenceThreshold) && first.region) {
      const second = await inspect(e, { ...base, crop: await cropRegion(after, first.region) });
      passes.push({ obs: second, pass: 2 });
      observation = second;
      decision = combinePasses(line.acceptance, first, second, integrity, e.settings.confidenceThreshold);
    }
  }

  await e.db.tx(async (q) => {
    const j = await store.mustGetJob(q, job.id, { lock: true });
    const locked = await store.getLine(q, line.id, { lock: true });
    if (!locked || locked.status !== "PROVING") throw conflict("not_proving", `${line.code} changed while it was being checked`);
    const event = decision.verdict === "VERIFIED" ? "VERDICT_VERIFIED" : decision.verdict === "FAILED" ? "VERDICT_FAILED" : "VERDICT_NEEDS_REVIEW";
    await store.updateLine(q, line.id, { status: nextLineStatus(locked.status, event), review_due_at: null, flag_note: null });
    for (const p of passes) {
      await store.insertVerdict(q, {
        lineId: line.id,
        photoId: photo.id,
        observation: p.obs,
        verdict: p.pass === passes.length ? decision.verdict : decideVerdict(line.acceptance, p.obs, integrity, e.settings.confidenceThreshold).verdict,
        reasons: p.pass === passes.length ? decision.reasons : [],
        model: e.verifier.model,
        pass: p.pass,
      });
    }
    if (passes.length === 0) {
      await store.insertVerdict(q, {
        lineId: line.id,
        photoId: photo.id,
        observation: { line_id: line.code, same_location: "uncertain", recapture: "uncertain", checks: [], confidence: 0, homeowner_reason: decision.reasons.join("; ").slice(0, 200) },
        verdict: decision.verdict,
        reasons: decision.reasons,
        model: "integrity",
        pass: 0,
      });
    }
    if (j.status === "AUTHORIZED") await store.updateJob(q, job.id, { status: nextJobStatus(j.status, "FIRST_PROOF") });
    await store.appendEvent(q, {
      jobId: job.id,
      actor: "system",
      type: "VERDICT",
      data: { line: line.code, verdict: decision.verdict, reasons: decision.reasons, sample: !!input.sample, photo: photo.id },
    });
  });

  return { verdict: decision.verdict, reasons: decision.reasons, photoId: photo.id, integrity, observation };
}

/** A before-photo for the job (flow A). The first one sets the job's location anchor. */
export async function addBeforePhoto(
  e: Engine,
  input: { jobId: string; tradesId: string; photo: Uint8Array; gps: { lat: number; lng: number; accuracyM: number } | null; deviceId: string | null; lineId?: string | null },
): Promise<store.PhotoRow> {
  const job = await store.mustGetJob(e.db, input.jobId);
  if (job.trades_id !== input.tradesId) throw forbidden();
  if (job.status !== "DRAFT") throw conflict("scope_frozen", "before-photos are taken while the job is a draft");
  const count = await e.db.query<{ n: number }>("select count(*)::int8 as n from photos where job_id = $1 and kind = 'before'", [job.id]);
  if (count.rows[0]!.n >= 6) throw conflict("too_many_photos", "a job takes up to 6 before-photos");
  let bytes: Buffer;
  try {
    bytes = await normalizePhoto(input.photo);
  } catch {
    throw badRequest("bad_photo", "that file isn't a photo we can read");
  }
  const hash = await dHash(bytes);
  const photoId = randomUUID();
  const path = photoPath(job.id, "before", photoId);
  await e.storage.put(path, bytes, "image/jpeg");
  const photo = await store.insertPhoto(e.db, {
    id: photoId,
    job_id: job.id,
    line_id: input.lineId ?? null,
    kind: "before",
    storage_path: path,
    dhash: hash,
    lat: input.gps?.lat ?? null,
    lng: input.gps?.lng ?? null,
    gps_accuracy_m: input.gps?.accuracyM ?? null,
    capture_token: null,
    device_id: input.deviceId,
    sample: false,
    taken_at: e.now(),
  });
  return e.db.tx(async (q) => {
    const j = await store.mustGetJob(q, job.id, { lock: true });
    if (j.anchor_lat == null && input.gps) await store.updateJob(q, job.id, { anchor_lat: input.gps.lat, anchor_lng: input.gps.lng });
    await store.appendEvent(q, { jobId: job.id, actor: "tradesperson", type: "BEFORE_PHOTO", data: { photo: photo.id } });
    return photo;
  });
}

async function inspect(e: Engine, input: Parameters<Engine["verifier"]["inspect"]>[0]): Promise<LineObservation> {
  try {
    return await e.verifier.inspect(input);
  } catch (err) {
    e.log.error("verifier failed", { line: input.lineId, err: String(err) });
    throw new EngineError("verifier_unavailable", "the photo check is unavailable; open the camera and try again", 503);
  }
}
