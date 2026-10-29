import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, PageHeader, Panel } from "@/components/app/shell";
import { IconActivity, IconArrow, IconDispute, IconShield } from "@/components/app/icons";
import { ProfileForm } from "@/components/app/settings-form";
import { when } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { profileOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function Settings() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings");
  const profile = await profileOf(user.id);
  return (
    <AppShell user={user}>
      <PageHeader eyebrow="Settings" title="Your account." body={`Member since ${when(profile.createdAt)}.`} />
      <div className="rise mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]" style={{ "--delay": "80ms" } as React.CSSProperties}>
        <div className="flex flex-col gap-6">
          <Panel title="Profile">
            <ProfileForm name={profile.displayName} paypalEmail={profile.paypalEmail} email={user.email} />
          </Panel>
          <Panel title="Two sides, one account">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-paper p-4">
                <div className="text-[14px] font-semibold">As a tradesperson</div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">Start a job, photograph the problem, write lines a camera can check, and prove each one on site. Releases go to your PayPal.</p>
              </div>
              <div className="rounded-2xl bg-paper p-4">
                <div className="text-[14px] font-semibold">As a homeowner</div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">Open a scope sent to your email, hold the money with PayPal, then review each proved line before it&apos;s paid.</p>
              </div>
            </div>
            <p className="mt-4 text-[13px] text-muted">Your role is set per job, so the same account can do both.</p>
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <Panel title="More">
            <ul className="-mx-2">
              {[
                { href: "/rules", label: "Payment rules", icon: IconShield },
                { href: "/activity", label: "Activity", icon: IconActivity },
                { href: "/disputes", label: "Disputes", icon: IconDispute },
              ].map((x) => (
                <li key={x.href}>
                  <Link href={x.href} className="flex h-11 items-center gap-3 rounded-xl px-2 text-[14px] font-medium hover:bg-paper">
                    <x.icon className="h-[18px] w-[18px] text-muted" /> <span className="flex-1">{x.label}</span> <IconArrow className="h-3.5 w-3.5 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Your data">
            <ul className="space-y-2 text-[13.5px] leading-relaxed text-muted">
              <li>Photos and check results are kept for 180 days after a job closes, the window in which disputes can arise.</li>
              <li>Locations are only stored for photos, never tracked, and rounded to about 11 m in evidence.</li>
              <li>This is a PayPal sandbox build: no real money moves.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
