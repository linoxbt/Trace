import Link from "next/link";
import { Logo } from "@/components/logo";
import type { SessionUser } from "@/server/auth";
import { jobsOf, profileOf, waitingCount } from "@/server/app-data";
import { AccountMenu } from "./account-menu";
import { IconBell, IconPlus } from "./icons";
import { Sidebar, TabBar } from "./nav";

/**
 * The signed-in app frame. Desktop: a sidebar with every section, a slim top
 * bar, and a wide content column. Phones: a top bar and a tab bar.
 */
export async function AppShell({
  children,
  user,
  back,
  wide = true,
}: {
  children: React.ReactNode;
  user: SessionUser;
  back?: { href: string; label: string };
  wide?: boolean;
}) {
  const [profile, waiting, jobs] = await Promise.all([profileOf(user.id), waitingCount(user.id, user.email), jobsOf(user.id, 60)]);
  const canCreate = !user.anonymous;
  const live = jobs.filter((j) => !["COMPLETED", "CLOSED_VOIDED", "DRAFT"].includes(j.status));
  const heldCents = live.reduce((n, j) => n + Math.max(0, j.heldCents - j.releasedCents), 0);
  const releasedCents = jobs.reduce((n, j) => n + j.releasedCents, 0);
  return (
    <div className="min-h-dvh">
      <div className="dots pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <Sidebar
        waiting={waiting}
        name={profile.displayName}
        email={user.email}
        canCreate={canCreate}
        heldCents={heldCents}
        releasedCents={releasedCents}
        jobs={live.slice(0, 4).map((j) => ({ id: j.id, address: j.address, strip: j.strip }))}
      />
      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur-xl">
          <div className={`mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-10 ${wide ? "max-w-[1280px]" : "max-w-4xl"}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="lg:hidden">
                <Logo href="/dashboard" size={26} />
              </span>
              {back && (
                <Link href={back.href} className="press hidden items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-ink lg:inline-flex">
                  <span aria-hidden>←</span> {back.label}
                </Link>
              )}
              <span className="hidden items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint xl:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-brass" /> PayPal sandbox · no real money moves
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canCreate && (
                <Link href="/jobs/new" className="press btn-ink hidden h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium sm:inline-flex lg:hidden">
                  <IconPlus /> New job
                </Link>
              )}
              <Link href="/approvals" className="press relative grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-paper" aria-label={`Waiting on you: ${waiting}`}>
                <IconBell />
                {waiting > 0 && <span className="num absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-violet px-1 text-[10px] font-semibold text-white">{waiting}</span>}
              </Link>
              <span className="lg:hidden">
                <AccountMenu email={user.email} />
              </span>
            </div>
          </div>
        </header>
        <main className={`mx-auto w-full min-w-0 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-9 ${wide ? "max-w-[1280px]" : "max-w-4xl"}`}>{children}</main>
      </div>
      <TabBar waiting={waiting} />
    </div>
  );
}

/** A page's title block: the brand eyebrow, a display title, one line of context and actions on the right. */
export function PageHeader({ eyebrow, title, body, actions }: { eyebrow?: string; title: React.ReactNode; body?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-3 text-[38px] leading-[0.98] sm:text-[52px]">{title}</h1>
        {body && <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">{body}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A section label inside a page: the brand's mono clause with a hairline. */
export function Clause({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">{children}</span>
      <span className="rule-dashed h-px flex-1" aria-hidden />
      {action}
    </div>
  );
}

/** A plain card with an optional title row. */
export function Panel({ title, action, children, className = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`surface rounded-[24px] p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-soft text-violet">{icon}</span>
      <div className="mt-4 text-[16px] font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-[14px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
