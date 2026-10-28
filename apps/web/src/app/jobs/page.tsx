import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { StatusChip } from "@/components/status";
import { money, when } from "@/lib/format";
import { currentUser } from "@/server/auth";
import { myJobs } from "@/server/view";

export const dynamic = "force-dynamic";

export default async function Jobs() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/jobs");
  const jobs = await myJobs(user.id);
  return (
    <main className="px-5 pb-10 pt-8">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="max-w-[55%] truncate text-xs text-muted">{user.email ?? "Guest"}</span>
      </div>
      <div className="mt-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        {!user.anonymous && (
          <Link href="/jobs/new" className="flex h-11 items-center rounded-xl bg-teal px-4 text-sm font-medium text-white">
            New job
          </Link>
        )}
      </div>
      {jobs.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-6 text-center text-muted">
          No jobs yet. A tradesperson starts one; a homeowner gets a link by email.
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/jobs/${j.id}`} className="block rounded-2xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{j.address}</div>
                    <div className="mt-1 text-xs text-muted">
                      {j.role === "tradesperson" ? "You're the tradesperson" : "You're the homeowner"} · <span className="num">{when(j.createdAt)}</span>
                    </div>
                  </div>
                  <div className="num shrink-0 font-semibold">{money(j.totalCents)}</div>
                </div>
                <div className="mt-3">
                  <StatusChip status={j.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
