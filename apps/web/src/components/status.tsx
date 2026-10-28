// Status chips pair colour with an icon and a word, never colour alone.

const LOOK: Record<string, { label: string; icon: string; cls: string }> = {
  PENDING: { label: "Pending", icon: "○", cls: "bg-paper text-muted border-line" },
  PROVING: { label: "Proving", icon: "◔", cls: "bg-teal-soft text-teal border-teal/30" },
  VERIFIED: { label: "Verified", icon: "✓", cls: "bg-ok-soft text-ok border-ok/30" },
  NEEDS_REVIEW: { label: "Needs review", icon: "!", cls: "bg-warn-soft text-warn border-warn/30" },
  FAILED: { label: "Failed", icon: "✕", cls: "bg-bad-soft text-bad border-bad/30" },
  APPROVED: { label: "Approved", icon: "✓", cls: "bg-ok-soft text-ok border-ok/30" },
  FLAGGED: { label: "Flagged", icon: "⚑", cls: "bg-warn-soft text-warn border-warn/30" },
  CAPTURED: { label: "Paid", icon: "●", cls: "bg-teal text-white border-teal" },
  DROPPED: { label: "Dropped", icon: "–", cls: "bg-paper text-muted border-line line-through" },
  DRAFT: { label: "Draft", icon: "○", cls: "bg-paper text-muted border-line" },
  AWAITING_APPROVAL: { label: "Awaiting approval", icon: "◔", cls: "bg-warn-soft text-warn border-warn/30" },
  AUTHORIZED: { label: "Money held", icon: "▣", cls: "bg-teal-soft text-teal border-teal/30" },
  IN_PROGRESS: { label: "In progress", icon: "◑", cls: "bg-teal-soft text-teal border-teal/30" },
  PARTIALLY_RELEASED: { label: "Partly released", icon: "◕", cls: "bg-teal-soft text-teal border-teal/30" },
  COMPLETED: { label: "Completed", icon: "●", cls: "bg-ok-soft text-ok border-ok/30" },
  CLOSED_VOIDED: { label: "Closed, hold released", icon: "–", cls: "bg-paper text-muted border-line" },
};

export function StatusChip({ status }: { status: string }) {
  const l = LOOK[status] ?? { label: status, icon: "·", cls: "bg-paper text-muted border-line" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${l.cls}`}>
      <span aria-hidden>{l.icon}</span>
      {l.label}
    </span>
  );
}
