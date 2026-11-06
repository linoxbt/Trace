import { autoRelease, checkPendingHolds, purgeExpiredProof, retryFailedWebhooks, expireApprovals, reauthorizeDue, retrySendingCaptures, type Engine } from "@trace/engine/worker";

export interface TickReport {
  approved: number;
  released: number;
  retried: number;
  reauthorized: string[];
  reauthorizeFailed: string[];
  approvalsExpired: number;
  pendingHoldsSettled: number;
  proofDeleted: number;
  webhooksRetried: number;
}

/** One pass of the worker's periodic jobs. Each step is idempotent. */
export async function tick(e: Engine): Promise<TickReport> {
  const retried = await retrySendingCaptures(e);
  const auto = await autoRelease(e);
  const re = await reauthorizeDue(e);
  const approvalsExpired = await expireApprovals(e);
  const pendingHoldsSettled = await checkPendingHolds(e);
  const proofDeleted = (await purgeExpiredProof(e)).length;
  const webhooksRetried = await retryFailedWebhooks(e);
  return {
    approved: auto.approved,
    released: auto.released.filter((r) => r.kind === "captured").length,
    retried: retried.length,
    reauthorized: re.reauthorized,
    reauthorizeFailed: re.failed,
    approvalsExpired,
    pendingHoldsSettled,
    proofDeleted,
    webhooksRetried,
  };
}
