import type { InboxItem } from "@/server/app-data";
import { money } from "@/lib/format";
import { IconCamera, IconCheck, IconChevron, IconDispute, IconDoc, IconMail, IconShield } from "./icons";
import { IconCircle, Row, type Tone } from "./ui";

const LOOK: Record<InboxItem["kind"], { icon: (p: { className?: string }) => React.ReactElement; tone: Tone; cta: string }> = {
  guard_approval: { icon: IconShield, tone: "violet", cta: "Decide" },
  dispute: { icon: IconDispute, tone: "red", cta: "Respond" },
  invite: { icon: IconMail, tone: "violet", cta: "Open" },
  approve_hold: { icon: IconCheck, tone: "amber", cta: "Review" },
  review: { icon: IconCheck, tone: "green", cta: "Review" },
  prove: { icon: IconCamera, tone: "grey", cta: "Prove" },
  finish_scope: { icon: IconDoc, tone: "grey", cta: "Continue" },
};

/** Things waiting on the person, as list rows with the action on the right. */
export function InboxRows({ items }: { items: InboxItem[] }) {
  return (
    <div className="divide-y divide-[#f0f0f4]">
      {items.map((it) => {
        const l = LOOK[it.kind];
        return (
          <Row
            key={it.key}
            href={it.href ?? `/jobs/${it.jobId}`}
            icon={
              <IconCircle tone={l.tone} size={42}>
                <l.icon className="h-5 w-5" />
              </IconCircle>
            }
            title={it.title}
            sub={`${it.address} · ${it.detail}`}
            value={it.amountCents !== null ? money(it.amountCents) : undefined}
            action={
              <span className="ml-1 hidden shrink-0 items-center gap-0.5 rounded-full bg-[#f1f1f5] px-3 py-1.5 text-[13px] font-medium text-ink-2 sm:inline-flex">
                {l.cta} <IconChevron className="h-3.5 w-3.5" />
              </span>
            }
          />
        );
      })}
    </div>
  );
}
