import { redirect } from "next/navigation";
import { AppShell, Empty, PageHeader, Panel } from "@/components/app/shell";
import { IconInbox } from "@/components/app/icons";
import { InboxList } from "@/components/app/inbox";
import { currentUser } from "@/server/auth";
import { inboxOf, type InboxItem } from "@/server/app-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waiting on you" };

const GROUPS: { title: string; body: string; kinds: InboxItem["kind"][] }[] = [
  { title: "Decisions", body: "Money moves the guard held back for you, and disputes waiting for your evidence.", kinds: ["guard_approval", "dispute"] },
  { title: "To approve", body: "Scopes sent to you, and holds waiting for your PayPal approval.", kinds: ["invite", "approve_hold"] },
  { title: "To review", body: "Proved work waiting for your approve or flag.", kinds: ["review"] },
  { title: "To do on site", body: "Lines to prove, and scopes still being written.", kinds: ["prove", "finish_scope"] },
];

export default async function Approvals() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/approvals");
  const inbox = await inboxOf(user.id, user.email);
  return (
    <AppShell user={user}>
      <PageHeader eyebrow="Waiting on you" title={inbox.length ? `${inbox.length} thing${inbox.length === 1 ? "" : "s"} to do.` : "All caught up."} body="Everything across your jobs that needs you, most urgent first." />
      <div className="rise mt-8 flex flex-col gap-6" style={{ "--delay": "80ms" } as React.CSSProperties}>
        {inbox.length === 0 ? (
          <div className="surface rounded-[24px]">
            <Empty icon={<IconInbox />} title="Nothing needs you" body="When a scope is sent to you, a line needs review or proof, or the guard asks before releasing money, it lands here." />
          </div>
        ) : (
          GROUPS.map((g) => {
            const items = inbox.filter((i) => g.kinds.includes(i.kind));
            if (!items.length) return null;
            return (
              <Panel key={g.title} title={`${g.title} · ${items.length}`}>
                <p className="-mt-2 mb-2 text-[13px] text-muted">{g.body}</p>
                <InboxList items={items} />
              </Panel>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
