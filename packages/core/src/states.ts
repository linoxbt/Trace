// The two state machines from spec section 8. Every legal move is listed here;
// anything else throws, so a route or the worker can never skip a step.

export const JOB_STATUSES = [
  "DRAFT",
  "AWAITING_APPROVAL",
  "AUTHORIZED",
  "IN_PROGRESS",
  "PARTIALLY_RELEASED",
  "COMPLETED",
  "CLOSED_VOIDED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const LINE_STATUSES = [
  "PENDING",
  "PROVING",
  "VERIFIED",
  "NEEDS_REVIEW",
  "FAILED",
  "APPROVED",
  "FLAGGED",
  "CAPTURED",
  "DROPPED",
] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

export type JobEvent =
  | "SCOPE_SENT"
  | "AUTHORIZED"
  | "FIRST_PROOF"
  | "PARTIAL_RELEASE"
  | "COMPLETED"
  | "CAPTURE_REVERSED"
  | "VOIDED";

export type LineEvent =
  | "TOKEN_ISSUED"
  | "VERDICT_VERIFIED"
  | "VERDICT_NEEDS_REVIEW"
  | "VERDICT_FAILED"
  | "APPROVE"
  | "AUTO_APPROVE"
  | "FLAG"
  | "CAPTURED"
  | "CAPTURE_DENIED"
  | "DROP";

const OPEN_JOB: JobStatus[] = ["DRAFT", "AWAITING_APPROVAL", "AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

const JOB_MOVES: { from: JobStatus[]; on: JobEvent; to: JobStatus }[] = [
  { from: ["DRAFT"], on: "SCOPE_SENT", to: "AWAITING_APPROVAL" },
  { from: ["AWAITING_APPROVAL"], on: "AUTHORIZED", to: "AUTHORIZED" },
  { from: ["AUTHORIZED"], on: "FIRST_PROOF", to: "IN_PROGRESS" },
  { from: ["IN_PROGRESS", "PARTIALLY_RELEASED"], on: "PARTIAL_RELEASE", to: "PARTIALLY_RELEASED" },
  { from: ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"], on: "COMPLETED", to: "COMPLETED" },
  // A pending capture PayPal later denies puts its lines back.
  { from: ["COMPLETED", "PARTIALLY_RELEASED"], on: "CAPTURE_REVERSED", to: "PARTIALLY_RELEASED" },
  { from: OPEN_JOB, on: "VOIDED", to: "CLOSED_VOIDED" },
];

const LINE_MOVES: { from: LineStatus[]; on: LineEvent; to: LineStatus }[] = [
  // Opening the camera again on a line being proved just issues a fresh token.
  { from: ["PENDING", "PROVING", "FAILED", "FLAGGED"], on: "TOKEN_ISSUED", to: "PROVING" },
  { from: ["PROVING"], on: "VERDICT_VERIFIED", to: "VERIFIED" },
  { from: ["PROVING"], on: "VERDICT_NEEDS_REVIEW", to: "NEEDS_REVIEW" },
  { from: ["PROVING"], on: "VERDICT_FAILED", to: "FAILED" },
  { from: ["VERIFIED", "NEEDS_REVIEW"], on: "APPROVE", to: "APPROVED" },
  // Silence approves a Verified line only. A Needs review line never auto-releases.
  { from: ["VERIFIED"], on: "AUTO_APPROVE", to: "APPROVED" },
  { from: ["VERIFIED", "NEEDS_REVIEW"], on: "FLAG", to: "FLAGGED" },
  { from: ["APPROVED"], on: "CAPTURED", to: "CAPTURED" },
  { from: ["CAPTURED"], on: "CAPTURE_DENIED", to: "APPROVED" },
  { from: ["PENDING", "PROVING", "VERIFIED", "NEEDS_REVIEW", "FAILED", "APPROVED", "FLAGGED"], on: "DROP", to: "DROPPED" },
];

export class IllegalTransition extends Error {
  constructor(
    readonly machine: "job" | "line",
    readonly from: string,
    readonly event: string,
  ) {
    super(`illegal ${machine} transition: ${event} from ${from}`);
    this.name = "IllegalTransition";
  }
}

export function nextJobStatus(from: JobStatus, on: JobEvent): JobStatus {
  const move = JOB_MOVES.find((m) => m.on === on && m.from.includes(from));
  if (!move) throw new IllegalTransition("job", from, on);
  return move.to;
}

export function nextLineStatus(from: LineStatus, on: LineEvent): LineStatus {
  const move = LINE_MOVES.find((m) => m.on === on && m.from.includes(from));
  if (!move) throw new IllegalTransition("line", from, on);
  return move.to;
}

export function canLine(from: LineStatus, on: LineEvent): boolean {
  return LINE_MOVES.some((m) => m.on === on && m.from.includes(from));
}

export function isOpenJob(status: JobStatus): boolean {
  return OPEN_JOB.includes(status);
}

/** A line is resolved once nothing more can happen to its money. */
export function isResolvedLine(status: LineStatus): boolean {
  return status === "CAPTURED" || status === "DROPPED";
}
