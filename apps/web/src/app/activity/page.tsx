import { redirect } from "next/navigation";
import { AppShell, Empty, PageHeader } from "@/components/app/shell";
import { IconActivity } from "@/components/app/icons";
import { ActivityFeed } from "@/components/app/activity";
import { currentUser } from "@/server/auth";
import { activityOf } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity" };

export default async function Activity() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/activity");
  const items = await activityOf(user.id, 200);
  return (
    <AppShell user={user}>
      <PageHeader eyebrow="Activity" title="Everything that happened." body="Every job's timeline in one place: proof, money, the guard's decisions. Nothing here can be edited after the fact." />
      <div className="rise mt-8" style={{ "--delay": "80ms" } as React.CSSProperties}>
        {items.length ? (
          <ActivityFeed items={items} />
        ) : (
          <div className="surface rounded-[24px]">
            <Empty icon={<IconActivity />} title="No activity yet" body="Photos, verdicts, holds, releases and guard decisions on your jobs show up here as they happen." />
          </div>
        )}
      </div>
    </AppShell>
  );
}
