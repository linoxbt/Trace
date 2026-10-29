// The trust trail behind a money action (Tripwire section 7): which verdicts
// it rests on, which proofs those verdicts read, and how far each input can
// be trusted. Photos and anything a model read from them are never "system".

import type { Decision, MoneyAction } from "@trace/core";
import * as store from "@trace/db";
import type { Engine } from "../deps.ts";

export async function buildProvenance(
  e: Engine,
  jobId: string,
  lineIds: string[],
  approvalEventIds: number[] = [],
): Promise<{ provenance: MoneyAction["provenance"]; injection: Decision["injection"] }> {
  const latest = lineIds.length
    ? (
        await e.db.query<{ id: string; line_id: string; photo_id: string }>(
          `select distinct on (line_id) id, line_id, photo_id from verdicts
            where line_id = any($1::uuid[]) and not masked order by line_id, created_at desc, pass desc`,
          [lineIds],
        )
      ).rows
    : [];
  const photos = latest.length
    ? (await e.db.query<{ id: string; injection_flag: boolean }>("select id, injection_flag from photos where id = any($1::uuid[])", [latest.map((v) => v.photo_id)])).rows
    : [];
  const lines = (await store.getLines(e.db, jobId)).filter((l) => lineIds.includes(l.id));

  const inputs: MoneyAction["provenance"]["inputs"] = [
    ...lines.map((l) => ({ ref: `line:${l.id}`, trust: "tradesperson" as const })),
    ...latest.map((v) => ({ ref: `proof:${v.photo_id}`, trust: "untrusted_content" as const })),
    ...latest.map((v) => ({ ref: `verdict:${v.id}`, trust: "ai_output" as const })),
  ];
  // Anything else labelled on the job (homeowner notes, for example) rides along.
  for (const l of await store.labelsForJob(e.db, jobId)) if (!inputs.some((i) => i.ref === l.ref)) inputs.push({ ref: l.ref, trust: l.trust });

  const flagged = photos.filter((p) => p.injection_flag).map((p) => p.id);
  const excerpt = lines.find((l) => l.injection_flag && l.injection_excerpt)?.injection_excerpt ?? undefined;
  return {
    provenance: { verdict_ids: latest.map((v) => v.id), approval_event_ids: approvalEventIds, inputs },
    injection: { flagged: flagged.length > 0, proof_ids: flagged, ...(excerpt ? { excerpt } : {}) },
  };
}
