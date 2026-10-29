import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { IconActivity } from "@/components/app/icons";
import { ActivityFeed } from "@/components/app/activity";
import { Card, Empty, PageTitle } from "@/components/app/ui";
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
      <PageTitle title="Activity" sub="Everything that happened on your jobs. Nothing here can be changed afterwards." />
      <div className="mt-6">
        {items.length ? (
          <ActivityFeed items={items} />
        ) : (
          <Card>
            <Empty icon={<IconActivity />} title="No activity yet" body="Holds, photos, checks and payments on your jobs appear here as they happen." />
          </Card>
        )}
      </div>
    </AppShell>
  );
}
