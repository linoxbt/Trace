import { autoRelease, reauthorizeDue, retrySendingCaptures, type Engine } from "@trace/engine/worker";

export interface TickReport {
  approved: number;
  released: number;
  retried: number;
  reauthorized: string[];
  reauthorizeFailed: string[];
}

/** One pass of the worker's periodic jobs. Each step is idempotent. */
export async function tick(e: Engine): Promise<TickReport> {
  const retried = await retrySendingCaptures(e);
  const auto = await autoRelease(e);
  const re = await reauthorizeDue(e);
  // Keeps Supabase from pausing an idle project between submission and judging.
  await e.db.query("select 1 from jobs limit 1");
  return {
    approved: auto.approved,
    released: auto.released.filter((r) => r.kind === "captured").length,
    retried: retried.length,
    reauthorized: re.reauthorized,
    reauthorizeFailed: re.failed,
  };
}
