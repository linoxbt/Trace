// What AI spend each person may cause per hour, reserved before the model
// call so parallel requests can't all slip under the limit. Demo jobs are
// anyone's (a free guest session is enough), so they also share one global
// allowance: a script opening guest sessions can't run up the bill.

import type { Engine } from "./deps.ts";
import { EngineError } from "./errors.ts";

/** Per person per hour. A proof is one AI check (its look, second look, text scan and re-judge). */
export const HOURLY_LIMITS = {
  proof: 60,
  demo_proof: 20,
  demo_job: 3,
  scope_draft: 20,
  dispute_draft: 20,
  rule_compile: 30,
} as const;
export type BudgetKind = keyof typeof HOURLY_LIMITS;

/** Every guest and demo action together, per hour. */
export const GUEST_HOURLY_LIMIT = 400;

const WORDS: Record<BudgetKind, string> = {
  proof: "AI checks",
  demo_proof: "demo AI checks",
  demo_job: "demo jobs",
  scope_draft: "AI drafts",
  dispute_draft: "dispute drafts",
  rule_compile: "rule checks",
};

/**
 * Reserve one unit of `kind` for this user, or refuse with a 429. `guest`
 * marks spend that counts toward the shared guest allowance too (demo jobs,
 * guest sessions). The reservation stands even if the call then fails.
 */
export async function spendBudget(e: Engine, userId: string, kind: BudgetKind, opts: { guest?: boolean } = {}): Promise<void> {
  const guest = !!opts.guest;
  await e.db.tx(async (q) => {
    // Serialise this user's reservations, and all guests' when it counts toward theirs.
    await q.query("select pg_advisory_xact_lock(hashtext('model_usage:' || $1))", [userId]);
    if (guest) await q.query("select pg_advisory_xact_lock(hashtext('model_usage:guests'))");
    const { rows } = await q.query<{ mine: number; guests: number }>(
      `select (select count(*) from model_usage where user_id = $1 and kind = $2 and created_at > now() - interval '1 hour')::int as mine,
              (select count(*) from model_usage where guest and created_at > now() - interval '1 hour')::int as guests`,
      [userId, kind],
    );
    const { mine, guests } = rows[0]!;
    if (mine >= HOURLY_LIMITS[kind]) {
      throw new EngineError("rate_limited", `That's the limit of ${HOURLY_LIMITS[kind]} ${WORDS[kind]} an hour. Try again a little later.`, 429);
    }
    if (guest && guests >= GUEST_HOURLY_LIMIT) {
      throw new EngineError("rate_limited", "The demo is busy right now. Try again in a few minutes.", 429);
    }
    await q.query("insert into model_usage (user_id, kind, guest) values ($1, $2, $3)", [userId, kind, guest]);
  });
}
