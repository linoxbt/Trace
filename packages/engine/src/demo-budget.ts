// Judge mode's cost cap: a visitor's AI checks on demo jobs per hour.

import type { Engine } from "./deps.ts";
import { EngineError } from "./errors.ts";

/** A visitor's model calls (verifier passes) per hour on demo jobs. */
export const DEMO_MODEL_CALLS_PER_HOUR = 20;

/** Refuse a demo proof once the visitor has spent this hour's model calls. */
export async function assertDemoBudget(e: Engine, userId: string): Promise<void> {
  const { rows } = await e.db.query<{ n: number }>(
    `select count(*)::int8 as n from verdicts v join lines l on l.id = v.line_id join jobs j on j.id = l.job_id
      where j.demo and j.trades_id = $1 and v.model <> 'integrity' and v.created_at > now() - interval '1 hour'`,
    [userId],
  );
  if (rows[0]!.n >= DEMO_MODEL_CALLS_PER_HOUR) {
    throw new EngineError("demo_limit", `The demo allows ${DEMO_MODEL_CALLS_PER_HOUR} AI checks an hour per visitor. Try again a little later.`, 429);
  }
}
