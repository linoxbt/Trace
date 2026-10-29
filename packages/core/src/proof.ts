// Proof types (spec section 6.2, verifier adapters). A line is proved by the
// cheapest proof that can actually prove it. Every adapter ends in the same
// LineObservation, so the verdict policy, capture math and the guard never
// need to know which proof type was used. Code, not the model, makes the
// deterministic checks here: a reading against its target, a document's total
// and date, a clip's length. Pure, safe in the browser.

import { z } from "zod";
import type { CheckResult, IntegrityReport } from "./integrity.ts";

export const PROOF_TYPES = ["photo", "video", "document", "reading", "deliverable", "attestation"] as const;
export const ProofType = z.enum(PROOF_TYPES);
export type ProofType = z.infer<typeof ProofType>;

/** Types proved through the in-app camera, with its token, geofence and device checks. */
export const CAMERA_PROOFS: ProofType[] = ["photo", "video", "reading"];

export const VideoSpec = z.object({ motion: z.string().trim().min(1).max(200) });
export const DocumentSpec = z.object({
  doc_kind: z.string().trim().min(1).max(60),
  /** The document's total must be at most the line's price. */
  total_at_most_price: z.boolean().default(false),
  must_match: z.array(z.string().trim().min(1).max(160)).max(4).default([]),
});
export const ReadingSpec = z
  .object({
    quantity: z.string().trim().min(1).max(60),
    unit: z.string().trim().min(1).max(20),
    op: z.enum(["gte", "lte", "between"]),
    target: z.number().finite(),
    target_max: z.number().finite().optional(),
  })
  .refine((s) => s.op !== "between" || (s.target_max !== undefined && s.target_max >= s.target), "between needs a maximum at least the minimum");
export const DeliverableSpec = z.object({
  kind: z.enum(["url", "file"]),
  /** For files: the kind of file expected. */
  mime: z.enum(["image", "pdf", "text", "any"]).default("any"),
});
export const AttestationSpec = z.object({
  email: z.email().max(200),
  name: z.string().trim().max(80).optional(),
  statement: z.string().trim().min(1).max(400),
});

export type VideoSpec = z.infer<typeof VideoSpec>;
export type DocumentSpec = z.infer<typeof DocumentSpec>;
export type ReadingSpec = z.infer<typeof ReadingSpec>;
export type DeliverableSpec = z.infer<typeof DeliverableSpec>;
export type AttestationSpec = z.infer<typeof AttestationSpec>;
export type ProofSpec = VideoSpec | DocumentSpec | ReadingSpec | DeliverableSpec | AttestationSpec;

const SPECS: Partial<Record<ProofType, z.ZodType>> = {
  video: VideoSpec,
  document: DocumentSpec,
  reading: ReadingSpec,
  deliverable: DeliverableSpec,
  attestation: AttestationSpec,
};

/** Check a line's proof details for its type. Photo lines carry none. */
export function parseProofSpec(type: ProofType, spec: unknown): { ok: true; spec: ProofSpec | null } | { ok: false; error: string } {
  const schema = SPECS[type];
  if (!schema) return { ok: true, spec: null };
  const r = schema.safeParse(spec ?? {});
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || type}: ${i.message}`).join("; ") };
  return { ok: true, spec: r.data as ProofSpec };
}

// ---------- deterministic checks ----------

export const CLIP_MIN_S = 5;
export const CLIP_MAX_S = 20;
export const VIDEO_FRAMES = 8;
export const MAX_PROOF_FILE_BYTES = 10 * 1024 * 1024;
/** How far apart the entered and the read value may be before a person looks. */
export const READING_TOLERANCE = 0.02;

export function readingMeets(spec: ReadingSpec, value: number): boolean {
  if (spec.op === "gte") return value >= spec.target;
  if (spec.op === "lte") return value <= spec.target;
  return value >= spec.target && value <= (spec.target_max ?? spec.target);
}

export function readingTarget(spec: ReadingSpec): string {
  const u = spec.unit;
  if (spec.op === "gte") return `at least ${spec.target} ${u}`;
  if (spec.op === "lte") return `at most ${spec.target} ${u}`;
  return `between ${spec.target} and ${spec.target_max} ${u}`;
}

/** The entered value and the value read off the photo agree, within 2% (or 0.01 near zero). */
export function readingsAgree(entered: number, read: number): boolean {
  return Math.abs(entered - read) <= Math.max(READING_TOLERANCE * Math.abs(read), 0.01);
}

export interface ProofCheck {
  name: string;
  result: CheckResult;
  detail: string;
}

/**
 * The integrity report for a proof that isn't a single photo: its own checks
 * (file type, duplicate, clip length, URL status, date window), in the same
 * shape the verdict policy and the evidence pack already read.
 */
export function proofIntegrity(checks: ProofCheck[], opts: { sample?: boolean } = {}): IntegrityReport {
  const status = checks.some((c) => c.result === "fail") ? "fail" : checks.some((c) => c.result === "review") ? "review" : "pass";
  return { status, checks: checks as IntegrityReport["checks"], distanceM: null, beforeHamming: null, reuseHamming: null, sample: !!opts.sample };
}

/** Is a document's date inside the job's window (from 30 days before it was created to tomorrow)? */
export function inJobWindow(date: string | null, jobCreated: Date, now: Date): boolean | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  return t >= jobCreated.getTime() - 30 * 86_400_000 && t <= now.getTime() + 86_400_000;
}
