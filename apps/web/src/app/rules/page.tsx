import { redirect } from "next/navigation";
import { listRules } from "@trace/engine";
import { AppShell, PageHeader } from "@/components/app/shell";
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
    <AppShell user={user}>
      <PageHeader
        eyebrow="Payment rules"
        title="Your rules, in your words."
        body="Every release is checked against live PayPal state and these rules before any money moves. Add your own checks on top of the built-in ones; they can only make things stricter."
      />
      <div className="rise mt-8" style={{ "--delay": "80ms" } as React.CSSProperties}>
        <RulesScreen initial={data} />
      </div>
    </AppShell>
  );
}
