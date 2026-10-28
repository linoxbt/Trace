import Link from "next/link";
import { Logo } from "@/components/logo";
import { AccountMenu } from "./account-menu";

/** The signed-in app frame: a floating pill bar, as on the site, over a centred column. */
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
      <div className="dots pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <div className={`glass mx-auto flex h-[60px] items-center justify-between rounded-full border border-white pl-5 pr-2.5 shadow-[0_12px_32px_-14px_rgb(40_24_80/0.28)] ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Logo href="/jobs" />
            {back && (
              <>
                <span className="text-faint" aria-hidden>
                  /
                </span>
                <Link href={back.href} className="truncate rounded-full bg-paper px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink">
                  {back.label}
                </Link>
              </>
            )}
          </div>
          {email !== undefined && <AccountMenu email={email} />}
        </div>
      </header>
      <main className={`mx-auto px-4 pb-24 pt-8 sm:px-6 sm:pt-12 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>{children}</main>
    </div>
  );
}
