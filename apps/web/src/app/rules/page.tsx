import { redirect } from "next/navigation";
import { listRules } from "@trace/engine";
import { AppShell } from "@/components/app/shell";
import { RulesScreen } from "@/components/rules";
import { currentUser } from "@/server/auth";
import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment rules" };

export default async function Rules() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/rules");
  const data = await listRules(engine(), user.id);
  return (
    <AppShell email={user.email} back={{ href: "/jobs", label: "Jobs" }} wide>
      <div className="rise">
        <p className="text-[13px] font-medium text-violet">Payment rules</p>
        <h1 className="display mt-1 text-[40px] leading-[1] sm:text-[52px]">Your rules, in your words.</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Every release is checked against live PayPal state and these rules before any money moves. Add your own checks on top of the built-in ones; they can only make things stricter.
        </p>
      </div>
      <div className="rise mt-8" style={{ "--delay": "80ms" } as React.CSSProperties}>
        <RulesScreen initial={data} />
      </div>
    </AppShell>
  );
}
