import Link from "next/link";
import type { InboxItem } from "@/server/app-data";
import { money, when } from "@/lib/format";
import { IconArrow, IconCamera, IconCheck, IconDispute, IconDoc, IconMail, IconShield } from "./icons";

const LOOK: Record<InboxItem["kind"], { icon: (p: { className?: string }) => React.ReactElement; cls: string; cta: string }> = {
  guard_approval: { icon: IconShield, cls: "bg-violet-soft text-violet", cta: "Decide" },
  dispute: { icon: IconDispute, cls: "bg-bad-soft text-bad", cta: "Respond" },
  invite: { icon: IconMail, cls: "bg-violet-soft text-violet", cta: "Open" },
  approve_hold: { icon: IconCheck, cls: "bg-warn-soft text-warn", cta: "Review" },
  review: { icon: IconCheck, cls: "bg-ok-soft text-ok", cta: "Review" },
  prove: { icon: IconCamera, cls: "bg-paper-2 text-ink-2", cta: "Prove" },
  finish_scope: { icon: IconDoc, cls: "bg-paper-2 text-ink-2", cta: "Continue" },
};

export function InboxList({ items }: { items: InboxItem[] }) {
  return (
    <ul className="-mx-2 divide-y divide-line">
      {items.map((it) => {
        const l = LOOK[it.kind];
        const Icon = l.icon;
        return (
          <li key={it.key}>
            <Link href={`/jobs/${it.jobId}`} className="group flex items-center gap-4 rounded-2xl px-2 py-3.5 hover:bg-paper">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${l.cls}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{it.title}</div>
                <div className="truncate text-[13px] text-muted">
                  {it.address} · {it.detail}
                </div>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                {it.amountCents !== null && <div className="num text-[14px] font-semibold">{money(it.amountCents)}</div>}
                <div className="num text-[11.5px] text-faint">{when(it.at)}</div>
              </div>
              <span className="hidden shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink-2 group-hover:border-violet group-hover:text-violet md:inline-flex">
                {l.cta} <IconArrow className="h-3.5 w-3.5" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
