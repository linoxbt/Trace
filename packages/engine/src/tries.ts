// How many times a line's proof is checked. Each try is another model call and
// another chance for the checker to slip, so tries are capped; the last one
// never ends in a dead end: a fail on it goes to the client, who decides.

import type { Queryable } from "@trace/db";
import type { Verdict } from "@trace/core";
import { conflict } from "./errors.ts";

/** Checks a line gets: camera proofs (photo, video, reading) and file proofs (document, deliverable). */
export const MAX_TRIES = { camera: 8, file: 5 } as const;
export type TryKind = keyof typeof MAX_TRIES;

/** Tries so far: one per proof checked (its passes and masked re-judge count once). */
export async function triesSoFar(q: Queryable, lineId: string): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    "select count(distinct coalesce(photo_id, proof_item_id))::int as n from verdicts where line_id = $1 and not masked",
    [lineId],
  );
  return rows[0]!.n;
}

/** Refuse another try once a line has had its last. */
export async function assertTriesLeft(q: Queryable, line: { id: string; code: string }, kind: TryKind): Promise<number> {
  const n = await triesSoFar(q, line.id);
  if (n >= MAX_TRIES[kind]) throw conflict("too_many_tries", `${line.code} has been checked ${n} times; the client reviews it from here`);
  return n;
}

/** On the last try, a fail goes to the client instead of leaving the line stuck. */
export function onLastTry<D extends { verdict: Verdict; reasons: string[] }>(decision: D, before: number, kind: TryKind): D {
  if (decision.verdict !== "FAILED" || before + 1 < MAX_TRIES[kind]) return decision;
  return { ...decision, verdict: "NEEDS_REVIEW", reasons: [...decision.reasons, `checked ${MAX_TRIES[kind]} times: the client decides`] };
}
