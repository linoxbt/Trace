import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { IconActivity, IconChevron, IconDispute, IconShield } from "@/components/app/icons";
import { GetPaid } from "@/components/app/get-paid";
import { ProfileForm } from "@/components/app/settings-form";
import { Card, CardHead, IconCircle, PageTitle } from "@/components/app/ui";
import { when } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { payeeStatus } from "@trace/engine";
import { profileOf } from "@/server/app-data";
import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ paypal?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings");
  const [profile, payee, { paypal }] = await Promise.all([profileOf(user.id), payeeStatus(engine(), user.id), searchParams]);
  const links = [
    { href: "/rules", label: "Payment rules", sub: "Checks the money guard runs before paying", icon: IconShield },
    { href: "/activity", label: "Activity", sub: "Everything that happened on your jobs", icon: IconActivity },
    { href: "/disputes", label: "Disputes", sub: "PayPal disputes and their evidence", icon: IconDispute },
  ];
  return (
    <AppShell user={user} wide={false}>
      <PageTitle title="Settings" />
      <Card className="mt-6 flex items-center gap-4 p-6">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-violet-soft text-[24px] font-semibold text-violet">{(profile.displayName || user.email || "G")[0]!.toUpperCase()}</span>
        <div className="min-w-0">
          <div className="truncate text-[20px] font-semibold tracking-[-0.01em]">{profile.displayName}</div>
          <div className="truncate text-[14px] text-muted">{user.email ?? "Guest"}</div>
          <div className="mt-0.5 text-[12.5px] text-faint">Member since {when(profile.createdAt)}</div>
        </div>
      </Card>
      <Card className="mt-5 overflow-hidden">
        <CardHead title="Profile" />
        <div className="px-5 pb-6 pt-2 sm:px-6">
          <ProfileForm name={profile.displayName} email={user.email} />
        </div>
      </Card>
      {!user.anonymous && (
        <Card className="mt-5 overflow-hidden">
          <div id="get-paid" className="scroll-mt-24" />
          <CardHead title="Get paid" />
          <GetPaid
            initial={{ state: payee.state, merchantId: payee.merchantId, receivable: payee.receivable, emailConfirmed: payee.emailConfirmed, permissions: payee.permissions }}
            flash={paypal}
          />
        </Card>
      )}
      <Card className="mt-5 overflow-hidden">
        <ul className="divide-y divide-[#f0f0f4]">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-[#f7f7fa] sm:px-6">
                <IconCircle tone="grey" size={40}>
                  <l.icon className="h-[19px] w-[19px]" />
                </IconCircle>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium">{l.label}</div>
                  <div className="truncate text-[13px] text-muted">{l.sub}</div>
                </div>
                <IconChevron className="h-4 w-4 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mt-5 p-5 text-[13.5px] leading-relaxed text-muted sm:p-6">
        <div className="mb-2 text-[15px] font-semibold text-ink">Your data</div>
        Photos and check results are kept for 180 days after a job closes, the window in which disputes can arise. Locations are only recorded with photos, never tracked. Payments for your jobs settle in your own PayPal account, never in Trace's. This is a PayPal sandbox build: no real money moves.
      </Card>
    </AppShell>
  );
}
