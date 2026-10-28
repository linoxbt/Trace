// Status chips pair colour with an icon and a word, never colour alone.

const LOOK: Record<string, { label: string; icon: string; cls: string }> = {
  PENDING: { label: "Not started", icon: "○", cls: "bg-paper-2 text-muted" },
  PROVING: { label: "Proving", icon: "◌", cls: "bg-violet-soft text-violet" },
  VERIFIED: { label: "Verified", icon: "✓", cls: "bg-ok-soft text-ok" },
  NEEDS_REVIEW: { label: "Needs review", icon: "!", cls: "bg-warn-soft text-warn" },
  FAILED: { label: "Failed", icon: "✕", cls: "bg-bad-soft text-bad" },
  APPROVED: { label: "Approved", icon: "✓", cls: "bg-ok-soft text-ok" },
  FLAGGED: { label: "Flagged", icon: "⚑", cls: "bg-warn-soft text-warn" },
  CAPTURED: { label: "Paid", icon: "●", cls: "bg-violet text-white" },
  DROPPED: { label: "Dropped", icon: "–", cls: "bg-paper-2 text-faint line-through" },
  DRAFT: { label: "Draft", icon: "○", cls: "bg-paper-2 text-muted" },
  AWAITING_APPROVAL: { label: "Awaiting approval", icon: "◔", cls: "bg-warn-soft text-warn" },
  AUTHORIZED: { label: "Money held", icon: "◆", cls: "bg-violet-soft text-violet" },
  IN_PROGRESS: { label: "In progress", icon: "◑", cls: "bg-violet-soft text-violet" },
  PARTIALLY_RELEASED: { label: "Part released", icon: "◕", cls: "bg-violet-soft text-violet" },
  COMPLETED: { label: "Completed", icon: "●", cls: "bg-ok-soft text-ok" },
  CLOSED_VOIDED: { label: "Closed, hold released", icon: "–", cls: "bg-paper-2 text-muted" },
};

export const LINE_RAIL: Record<string, string> = {
  PENDING: "bg-line-2",
  PROVING: "bg-violet",
  VERIFIED: "bg-ok",
  NEEDS_REVIEW: "bg-warn",
  FAILED: "bg-bad",
  APPROVED: "bg-ok",
  FLAGGED: "bg-warn",
  CAPTURED: "bg-violet",
  DROPPED: "bg-line",
};

export function StatusChip({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const l = LOOK[status] ?? { label: status, icon: "·", cls: "bg-paper-2 text-muted" };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-500 ${l.cls} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]"
      }`}
    >
      <span aria-hidden className="text-[0.9em] leading-none">{l.icon}</span>
      {l.label}
    </span>
  );
}
