import Link from "next/link";
import { Logo } from "@/components/logo";
import type { SessionUser } from "@/server/auth";
import { profileOf, waitingCount } from "@/server/app-data";
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
  const [profile, waiting] = await Promise.all([profileOf(user.id), waitingCount(user.id, user.email)]);
  const canCreate = !user.anonymous;
  return (
    <div className="min-h-dvh">
      <div className="dots pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <Sidebar waiting={waiting} name={profile.displayName} email={user.email} canCreate={canCreate} />
      <div className="lg:pl-[264px]">
        <header className="glass sticky top-0 z-30 border-b border-line/80">
          <div className={`mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-10 ${wide ? "max-w-[1280px]" : "max-w-4xl"}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="lg:hidden">
                <Logo href="/dashboard" size={26} />
              </span>
              {back && (
                <Link href={back.href} className="press hidden items-center gap-1.5 rounded-full px-1 text-[13.5px] font-medium text-muted hover:text-ink lg:inline-flex">
                  <span aria-hidden>←</span> {back.label}
                </Link>
              )}
              <span className="hidden truncate rounded-full bg-warn-soft px-2.5 py-1 text-[11.5px] font-medium text-warn xl:inline">Sandbox · no real money moves</span>
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
        <main className={`mx-auto w-full px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-9 ${wide ? "max-w-[1280px]" : "max-w-4xl"}`}>{children}</main>
      </div>
      <TabBar waiting={waiting} />
    </div>
  );
}

/** A page's title block: eyebrow, title, one line of context and actions on the right. */
export function PageHeader({ eyebrow, title, body, actions }: { eyebrow?: string; title: React.ReactNode; body?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-violet">{eyebrow}</p>}
        <h1 className="display mt-1.5 text-[34px] leading-[1.02] sm:text-[44px]">{title}</h1>
        {body && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{body}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
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
