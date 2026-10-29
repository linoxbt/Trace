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

const KIND: Record<InboxItem["kind"], { label: string; cls: string }> = {
  guard_approval: { label: "Guard asks", cls: "text-violet" },
  dispute: { label: "Dispute", cls: "text-bad" },
  invite: { label: "New scope", cls: "text-violet" },
  approve_hold: { label: "Approve & hold", cls: "text-warn" },
  review: { label: "Review", cls: "text-ok" },
  prove: { label: "Prove on site", cls: "text-ink-2" },
  finish_scope: { label: "Draft", cls: "text-muted" },
};

/** The to-do list as tickets: a photo of the job, what's needed, and the amount on the stub. */
export function InboxTickets({ items }: { items: InboxItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((it) => {
        const l = LOOK[it.kind];
        const k = KIND[it.kind];
        const Icon = l.icon;
        return (
          <li key={it.key} className="min-w-0">
            <Link href={`/jobs/${it.jobId}`} className="clay clay-hover group flex h-full items-stretch overflow-hidden rounded-[22px]">
              <div className="flex min-w-0 flex-1 items-center gap-3.5 p-3">
                <span className="bracket relative h-[60px] w-[60px] shrink-0 sm:h-[72px] sm:w-[72px] overflow-hidden rounded-[14px] bg-paper-2" style={{ "--bracket": "#ffffff" } as React.CSSProperties}>
                  {it.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className={`absolute inset-0 grid place-items-center ${l.cls}`}>
                      <Icon className="h-6 w-6" />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] ${k.cls}`}>{k.label}</div>
                  <div className="mt-0.5 truncate text-[15.5px] font-semibold leading-snug">{it.title}</div>
                  <div className="truncate text-[12.5px] text-muted">{it.address}</div>
                </div>
              </div>
              <div className="relative flex w-[92px] shrink-0 flex-col sm:w-[116px] items-center justify-center gap-1.5 border-l border-dashed border-line-2 bg-paper/60 px-2 text-center">
                <span className="absolute -left-[7px] -top-[7px] h-3.5 w-3.5 rounded-full bg-paper" aria-hidden />
                <span className="absolute -bottom-[7px] -left-[7px] h-3.5 w-3.5 rounded-full bg-paper" aria-hidden />
                <span className="num text-[13.5px] font-semibold sm:text-[15px]">{it.amountCents !== null ? money(it.amountCents) : "—"}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors group-hover:bg-violet">
                  {l.cta} <IconArrow className="h-3 w-3" />
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
