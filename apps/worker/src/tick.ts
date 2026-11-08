import {
  autoRelease,
  checkPendingHolds,
  expireApprovals,
  expireLapsedHolds,
  purgeExpiredProof,
  reauthorizeDue,
  releaseBeforeHoldLapses,
  retryFailedWebhooks,
  retrySendingCaptures,
  warnExpiringHolds,
  type Engine,
} from "@trace/engine/worker";

export interface TickReport {
  approved: number;
  released: number;
  retried: number;
  reauthorized: string[];
  reauthorizeFailed: string[];
  approvalsExpired: number;
  pendingHoldsSettled: number;
  holdsWarned: number;
  releasedBeforeLapse: number;
  holdsExpired: number;
  proofDeleted: number;
  webhooksRetried: number;
}

/**
 * One pass of the worker's periodic jobs. Each step is idempotent. Money steps
 * run first; the rest stop once the pass has used its time (a scheduled
 * function has 30 s), and simply run on the next pass. The retention scan runs
 * once an hour, not every minute.
 */
export async function tick(e: Engine, opts: { budgetMs?: number; now?: () => number } = {}): Promise<TickReport> {
  const now = opts.now ?? Date.now;
  const started = now();
  const time = () => now() - started < (opts.budgetMs ?? 20_000);
  const retried = await retrySendingCaptures(e);
  const auto = await autoRelease(e);
  const re = time() ? await reauthorizeDue(e) : { reauthorized: [], failed: [] };
  const lapse = time() ? await releaseBeforeHoldLapses(e) : [];
  const holdsExpired = time() ? await expireLapsedHolds(e) : 0;
  const holdsWarned = time() ? await warnExpiringHolds(e) : 0;
  const approvalsExpired = time() ? await expireApprovals(e) : 0;
  const pendingHoldsSettled = time() ? await checkPendingHolds(e) : 0;
  const webhooksRetried = time() ? await retryFailedWebhooks(e) : 0;
  const proofDeleted = time() && e.now().getUTCMinutes() === 17 ? (await purgeExpiredProof(e)).length : 0;
  return {
    approved: auto.approved,
    released: auto.released.filter((r) => r.kind === "captured").length,
    retried: retried.length,
    reauthorized: re.reauthorized,
    reauthorizeFailed: re.failed,
    approvalsExpired,
    pendingHoldsSettled,
    holdsWarned,
    releasedBeforeLapse: lapse.filter((r) => r.kind === "captured").length,
    holdsExpired,
    proofDeleted,
    webhooksRetried,
  };
}
