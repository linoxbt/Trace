import { autoRelease, expireApprovals, reauthorizeDue, retrySendingCaptures, type Engine } from "@trace/engine/worker";

export interface TickReport {
  approved: number;
  released: number;
  retried: number;
  reauthorized: string[];
  reauthorizeFailed: string[];
  approvalsExpired: number;
}

/** One pass of the worker's periodic jobs. Each step is idempotent. */
export async function tick(e: Engine): Promise<TickReport> {
  const retried = await retrySendingCaptures(e);
  const auto = await autoRelease(e);
  const re = await reauthorizeDue(e);
  const approvalsExpired = await expireApprovals(e);
  return {
    approved: auto.approved,
    released: auto.released.filter((r) => r.kind === "captured").length,
    retried: retried.length,
    reauthorized: re.reauthorized,
    reauthorizeFailed: re.failed,
    approvalsExpired,
  };
}
