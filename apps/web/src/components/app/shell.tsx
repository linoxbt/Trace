import Link from "next/link";
import { Logo } from "@/components/logo";
import { AccountMenu } from "./account-menu";

/** The signed-in app frame: a quiet glass bar and a centred reading column. */
export function AppShell({
  children,
  email,
  back,
  wide = false,
}: {
  children: React.ReactNode;
  email?: string | null;
  back?: { href: string; label: string };
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_60%_80%_at_50%_-20%,rgba(198,181,255,0.35),transparent)]" />
      <header className="glass sticky top-0 z-40 border-b border-line/70">
        <div className={`mx-auto flex h-14 items-center justify-between px-4 sm:px-6 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Logo href="/jobs" />
            {back && (
              <>
                <span className="text-line-2" aria-hidden>
                  /
                </span>
                <Link href={back.href} className="truncate text-[14px] text-muted transition-colors hover:text-ink">
                  {back.label}
                </Link>
              </>
            )}
          </div>
          {email !== undefined && <AccountMenu email={email} />}
        </div>
      </header>
      <main className={`mx-auto px-4 pb-24 pt-6 sm:px-6 sm:pt-10 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>{children}</main>
    </div>
  );
}
