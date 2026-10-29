import Link from "next/link";
import type { JobRowView } from "@/server/app-data";
import { Mark } from "@/components/logo";
import { StatusChip } from "@/components/status";
import { money, when } from "@/lib/format";
import { ProofStrip } from "./proof-strip";

/** A job as a proof card: its latest photo in a viewfinder, its lines as a strip, its money in figures. */
export function JobCard({ job: j, priority = false }: { job: JobRowView; priority?: boolean }) {
  const base = j.heldCents || j.totalCents;
  const draft = j.status === "DRAFT";
  return (
    <Link href={`/jobs/${j.id}`} className="clay clay-hover group block min-w-0 rounded-[28px] p-2.5">
      <div className="bracket relative aspect-[16/10] overflow-hidden rounded-[20px] bg-night" style={{ "--bracket": "#ffffff" } as React.CSSProperties}>
        {j.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={j.coverUrl}
            alt=""
            loading={priority ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
          />
        ) : (
          <div className="stage grain !absolute inset-0 grid place-items-center">
            <div className="dots-dark absolute inset-0 opacity-70" />
            <div className="relative flex flex-col items-center gap-2 text-white/60">
              <Mark size={34} tone="ink" className="opacity-80" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em]">{draft ? "Scope in draft" : "No photos yet"}</span>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
        <span className="absolute left-3 top-3 z-[3] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur">{j.side === "tradesperson" ? "Your job" : "Paying"}</span>
        <span className="absolute right-3 top-3 z-[3]">
          <StatusChip status={j.status} size="sm" />
        </span>
        <div className="absolute inset-x-4 bottom-3 z-[3] flex items-end justify-between gap-3 text-white">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/80">
            {j.lines} line{j.lines === 1 ? "" : "s"} · {when(j.updatedAt)}
          </span>
          {j.disputed && <span className="rounded-full bg-bad px-2 py-0.5 text-[10.5px] font-semibold">Disputed</span>}
        </div>
      </div>
      <div className="px-2.5 pb-2 pt-4">
        <h3 className="display truncate text-[22px] leading-tight">{j.address}</h3>
        <p className="mt-0.5 truncate text-[13px] text-muted">{j.side === "tradesperson" ? `For ${j.otherParty}` : `By ${j.otherParty}`}</p>
        <ProofStrip lines={j.strip} size="md" labels className="mt-4" />
        <div className="mt-3 flex items-baseline justify-between">
          <span className="num text-[13px] text-muted">
            {draft ? "Not sent yet" : `${j.paid} of ${j.lines} paid`}
          </span>
          <span className="num text-[15px]">
            <span className="font-semibold text-violet">{money(j.releasedCents)}</span>
            <span className="text-faint"> / {money(base)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
