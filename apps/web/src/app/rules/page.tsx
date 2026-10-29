import { redirect } from "next/navigation";
import { listRules } from "@trace/engine";
import { AppShell } from "@/components/app/shell";
import { PageTitle } from "@/components/app/ui";
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
      <PageTitle title="Payment rules" sub="Checks the money guard runs before any money moves. Yours can only make things stricter." />
      <div className="mt-6">
        <RulesScreen initial={data} />
      </div>
    </AppShell>
  );
}
