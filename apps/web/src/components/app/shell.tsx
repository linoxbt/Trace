import Link from "next/link";
import type { SessionUser } from "@/server/auth";
import { profileOf, waitingCount } from "@/server/app-data";
import { LiveRefresh } from "./live-refresh";
import { TabBar, TopNav } from "./nav";

/**
 * The signed-in app frame, banking-app style: a white top bar with tabs, a
 * light grey page, and a centred column. Phones get a bottom tab bar.
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
  return (
    <div className="app min-h-dvh bg-[#f6f6f9]">
      <TopNav waiting={waiting} name={profile.displayName} email={user.email} canCreate={!user.anonymous} />
      <main className={`mx-auto w-full min-w-0 px-4 pb-28 pt-6 sm:px-6 md:pb-16 md:pt-8 ${wide ? "max-w-[1120px]" : "max-w-[760px]"}`}>
        {back && (
          <Link href={back.href} className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        {children}
      </main>
      <TabBar waiting={waiting} />
      <LiveRefresh />
    </div>
  );
}
