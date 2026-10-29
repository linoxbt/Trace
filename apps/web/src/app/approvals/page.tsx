import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { IconInbox } from "@/components/app/icons";
import { InboxRows } from "@/components/app/inbox";
import { Card, CardHead, Empty, PageTitle } from "@/components/app/ui";
import { currentUser } from "@/server/auth";
import { inboxOf, type InboxItem } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "To do" };

const GROUPS: { title: string; sub: string; kinds: InboxItem["kind"][] }[] = [
  { title: "Needs a decision", sub: "Payments the money guard held for you, and disputes", kinds: ["guard_approval", "dispute"] },
  { title: "To approve", sub: "Scopes sent to you and holds waiting for PayPal", kinds: ["invite", "approve_hold"] },
  { title: "To review", sub: "Proved work waiting for your approval", kinds: ["review"] },
  { title: "On site", sub: "Lines to prove and scopes to finish", kinds: ["prove", "finish_scope"] },
];

export default async function ToDo() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/approvals");
  const inbox = await inboxOf(user.id, user.email);
  return (
    <AppShell user={user}>
      <PageTitle title="To do" sub={inbox.length ? `${inbox.length} thing${inbox.length === 1 ? "" : "s"} waiting on you, most urgent first.` : "Nothing is waiting on you."} />
      <div className="mt-6 flex flex-col gap-5">
        {inbox.length === 0 ? (
          <Card>
            <Empty icon={<IconInbox />} title="You're all caught up" body="Scopes sent to you, lines to review or prove, and payments the money guard asks you about appear here." />
          </Card>
        ) : (
          GROUPS.map((g) => {
            const items = inbox.filter((i) => g.kinds.includes(i.kind));
            if (!items.length) return null;
            return (
              <Card key={g.title} className="overflow-hidden pb-2">
                <CardHead title={g.title} sub={g.sub} />
                <InboxRows items={items} />
              </Card>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
