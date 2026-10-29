// How timeline events read, shared by the job timeline and the Activity page.

import { money } from "./format";

export interface EventLike {
  type: string;
  data: Record<string, unknown> | null;
}

export const LABELS: Record<string, string> = {
  JOB_CREATED: "Job created",
  BEFORE_PHOTO: "Before-photo taken",
  SCOPE_SENT: "Scope sent for approval",
  HOMEOWNER_JOINED: "Client joined",
  ORDER_CREATED: "PayPal order created",
  ORDER_APPROVED: "Approved in PayPal",
  AUTHORIZED: "Money held by PayPal",
  VERDICT: "Photo checked",
  SAMPLE_HISTORY: "Sample history added",
  RELEASE_REQUESTED: "Release requested",
  LINE_APPROVED: "Line approved",
  LINE_AUTO_APPROVED: "Line approved when the review window ended",
  LINE_FLAGGED: "Line flagged",
  RELEASE_STARTED: "Release sent to PayPal",
  CAPTURED: "Money released",
  CAPTURE_FAILED: "Release refused · nothing charged",
  CAPTURE_DENIED: "Release denied by PayPal",
  VOIDED: "Hold released",
  REAUTHORIZED: "Hold renewed",
  REAUTHORIZE_FAILED: "Hold couldn't be renewed",
  CLOSE_CONFIRMED: "Close confirmed",
  CLOSE_AGREED: "Close agreed by both sides",
  DISPUTE_OPENED: "Dispute opened",
  DISPUTE_UPDATED: "Dispute updated",
  DISPUTE_RESOLVED: "Dispute resolved",
  REFUNDED: "Refunded",
  GUARD_ALLOWED: "Guard: allowed",
  GUARD_BLOCKED: "Guard: blocked",
  GUARD_APPROVAL_NEEDED: "Guard: waiting for approval",
  GUARD_APPROVED: "Approved",
  GUARD_DENIED: "Denied",
  GUARD_APPROVAL_EXPIRED: "Approval request expired",
  INJECTION_FLAGGED: "Text in a proof was aimed at the inspector",
  RULE_ADDED: "Rule added",
};

export const GUARD_EVENTS = new Set(["GUARD_ALLOWED", "GUARD_BLOCKED", "GUARD_APPROVAL_NEEDED", "GUARD_APPROVED", "GUARD_DENIED", "GUARD_APPROVAL_EXPIRED", "INJECTION_FLAGGED", "RULE_ADDED"]);

export function eventLabel(e: EventLike): string {
  const base = LABELS[e.type] ?? e.type;
  const d = e.data ?? {};
  if (e.type.startsWith("GUARD_") && Array.isArray(d.reasons) && d.reasons.length) return String(d.reasons[0]);
  if (e.type === "INJECTION_FLAGGED" && d.line) return `${base} · ${d.line}`;
  if (e.type === "RULE_ADDED" && d.english) return `${base}: “${d.english}”`;
  if (e.type === "VERDICT") return `${d.line} ${String(d.verdict).toLowerCase().replace("_", " ")}${d.sample ? " · sample proof" : ""}`;
  if ((e.type === "CAPTURED" || e.type === "RELEASE_STARTED" || e.type === "AUTHORIZED") && typeof d.amount_cents === "number") return `${base} · ${money(d.amount_cents)}`;
  if ((e.type === "LINE_APPROVED" || e.type === "LINE_FLAGGED" || e.type === "LINE_AUTO_APPROVED") && d.line) return `${base} · ${d.line}`;
  return base;
}

export function eventDot(e: EventLike): string {
  if (e.type === "GUARD_ALLOWED" || e.type === "GUARD_APPROVED") return "bg-ok";
  if (e.type === "GUARD_BLOCKED" || e.type === "GUARD_DENIED" || e.type === "INJECTION_FLAGGED") return "bg-bad";
  if (e.type === "GUARD_APPROVAL_NEEDED" || e.type === "GUARD_APPROVAL_EXPIRED") return "bg-warn";
  if (e.type === "CAPTURED" || e.type === "AUTHORIZED") return "bg-violet";
  if (e.type.includes("FAILED") || e.type.includes("DENIED") || e.type.startsWith("DISPUTE")) return "bg-bad";
  if (e.type === "VERDICT") return e.data?.verdict === "VERIFIED" ? "bg-ok" : e.data?.verdict === "FAILED" ? "bg-bad" : "bg-warn";
  return "bg-line-2";
}


/** Which filter an event belongs to on the Activity page. */
export function eventGroup(type: string): "money" | "proof" | "guard" | "job" {
  if (GUARD_EVENTS.has(type)) return "guard";
  if (["AUTHORIZED", "ORDER_CREATED", "ORDER_APPROVED", "RELEASE_STARTED", "CAPTURED", "CAPTURE_FAILED", "CAPTURE_DENIED", "VOIDED", "REAUTHORIZED", "REAUTHORIZE_FAILED", "REFUNDED"].includes(type) || type.startsWith("DISPUTE")) return "money";
  if (["VERDICT", "BEFORE_PHOTO", "LINE_APPROVED", "LINE_AUTO_APPROVED", "LINE_FLAGGED", "RELEASE_REQUESTED"].includes(type)) return "proof";
  return "job";
}
