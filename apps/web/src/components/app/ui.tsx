// The signed-in app's building blocks, in the calm style of a banking app:
// white cards on a light grey page, one list-row pattern for everything that
// happened or needs doing, and money set large in tabular figures.

import Link from "next/link";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[22px] border border-[#ebebf0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>{children}</section>;
}

export function CardHead({ title, action, sub }: { title: string; action?: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 px-5 pb-2 pt-5 sm:px-6">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function SeeAll({ href, children = "See all" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13.5px] font-medium text-violet hover:text-violet-deep">
      {children}
    </Link>
  );
}

export type Tone = "violet" | "green" | "amber" | "red" | "grey" | "ink";

const TONE: Record<Tone, string> = {
  violet: "bg-violet-soft text-violet",
  green: "bg-ok-soft text-ok",
  amber: "bg-warn-soft text-warn",
  red: "bg-bad-soft text-bad",
  grey: "bg-[#f1f1f5] text-ink-2",
  ink: "bg-ink text-white",
};

export function IconCircle({ tone = "grey", size = 40, children, image }: { tone?: Tone; size?: number; children?: React.ReactNode; image?: string | null }) {
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full ${image ? "bg-[#f1f1f5]" : TONE[tone]}`} style={{ width: size, height: size }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        children
      )}
    </span>
  );
}

/** One row of a list: an icon, two lines of text, and a value on the right. */
export function Row({
  href,
  icon,
  title,
  sub,
  value,
  valueTone = "ink",
  meta,
  action,
}: {
  href?: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  valueTone?: "ink" | "green" | "muted" | "red";
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const vt = { ink: "text-ink", green: "text-ok", muted: "text-muted", red: "text-bad" }[valueTone];
  const body = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-snug">{title}</div>
        {sub && <div className="mt-0.5 truncate text-[13px] text-muted">{sub}</div>}
      </div>
      {(value !== undefined || meta) && (
        <div className="shrink-0 text-right">
          {value !== undefined && <div className={`text-[15px] font-semibold tabular-nums tracking-[-0.01em] ${vt}`}>{value}</div>}
          {meta && <div className="mt-0.5 text-[12px] text-faint">{meta}</div>}
        </div>
      )}
      {action}
    </>
  );
  const cls = "flex items-center gap-3.5 px-5 py-3 sm:px-6";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-[#f7f7fa]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A day label between groups of rows. */
export function DayLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-5 pb-1 pt-4 text-[12.5px] font-semibold text-muted sm:px-6">{children}</div>;
}

export function Pill({ tone = "grey", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONE[tone]}`}>{children}</span>;
}

/** A thin bar for how much of a job has been paid. */
export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-[#ececf2] ${className}`}>
      <div className="h-full rounded-full bg-violet transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** A round quick-action button with a label under it. */
export function QuickAction({ href, icon, label, badge }: { href: string; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col items-center gap-2 text-center sm:w-[76px]">
      <span className="relative grid h-12 w-12 place-items-center rounded-full bg-[#f1f1f5] sm:h-14 sm:w-14 text-ink transition-colors group-hover:bg-violet-soft group-hover:text-violet">
        {icon}
        {!!badge && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-violet px-1 text-[11px] font-semibold text-white ring-2 ring-white">{badge}</span>}
      </span>
      <span className="w-full truncate text-[12px] font-medium text-ink-2 sm:text-[12.5px]">{label}</span>
    </Link>
  );
}

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <IconCircle tone="violet" size={48}>
        {icon}
      </IconCircle>
      <div className="mt-4 text-[16px] font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-[14px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.025em] sm:text-[32px]">{title}</h1>
        {sub && <p className="mt-1 text-[14.5px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-violet px-4 text-[14px] font-semibold text-white hover:bg-violet-deep">
      {children}
    </Link>
  );
}

/** Money as a banking app sets it: whole part large, cents smaller. */
export function BigMoney({ cents, className = "" }: { cents: number; className?: string }) {
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  const [whole, frac] = s.split(".");
  return (
    <span className={`tabular-nums tracking-[-0.035em] ${className}`}>
      {whole}
      <span className="text-[0.55em] font-semibold tracking-[-0.01em] text-muted">.{frac}</span>
    </span>
  );
}
