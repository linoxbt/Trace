// Retention: a closed job's photos and proof files are deleted 180 days after
// its last activity, unless a dispute on it is still open; a demo job's after
// 30 days; a job that never went ahead (a draft, or never approved) 90 days
// after its last activity. The job, its lines, verdicts, checks and payment record stay, so the
// history still reads; the images, files and photo locations don't.

import * as store from "@trace/db";
import type { Engine } from "./deps.ts";

export const RETENTION_DAYS = 180;
export const DEMO_RETENTION_DAYS = 30;
/** A job that never got going (a draft, or never approved) keeps its photos this long after its last activity. */
export const STALE_OPEN_DAYS = 90;

/** Worker: clear a few jobs whose proof is past its keep-until date. Returns the jobs cleared. */
export async function purgeExpiredProof(e: Engine, limit = 5): Promise<string[]> {
  const now = e.now();
  const { rows } = await e.db.query<{ id: string }>(
    `select j.id from jobs j
      where not exists (select 1 from proof_purges p where p.job_id = j.id)
        and (
          (j.demo and j.created_at < $1::timestamptz - make_interval(days => $3))
          or (j.status in ('COMPLETED', 'CLOSED_VOIDED')
              and not exists (select 1 from disputes d where d.job_id = j.id and coalesce(d.status, '') <> 'RESOLVED')
              and coalesce((select max(ev.at) from events ev where ev.job_id = j.id), j.created_at) < $1::timestamptz - make_interval(days => $2))
          or (j.status in ('DRAFT', 'AWAITING_APPROVAL')
              and coalesce((select max(ev.at) from events ev where ev.job_id = j.id), j.created_at) < $1::timestamptz - make_interval(days => $5))
        )
      order by j.created_at
      limit $4`,
    [now, RETENTION_DAYS, DEMO_RETENTION_DAYS, limit, STALE_OPEN_DAYS],
  );
  const done: string[] = [];
  for (const { id } of rows) {
    try {
      const files = await e.storage.removeUnder(`job/${id}/`);
      await e.db.tx(async (q) => {
        await store.mustGetJob(q, id, { lock: true });
        // Locations and the sign-off's network address go with the photos.
        await q.query("update photos set lat = null, lng = null where job_id = $1", [id]);
        await q.query("update jobs set anchor_lat = null, anchor_lng = null where id = $1", [id]);
        await q.query("update attestations set signed_ip = null where line_id in (select id from lines where job_id = $1)", [id]);
        await q.query("update proof_items set meta = meta - 'ip' where job_id = $1", [id]);
        await q.query("insert into proof_purges (job_id, files) values ($1, $2) on conflict do nothing", [id, files]);
        await store.appendEvent(q, { jobId: id, actor: "system", type: "PROOF_DELETED", data: { files } });
      });
      done.push(id);
    } catch (err) {
      e.log.warn("proof clean-up failed", { job: id, err: String(err) });
    }
  }
  return done;
}

/** When a job's photos and files were deleted, if they were. */
export async function proofDeletedAt(e: Engine, jobId: string): Promise<Date | null> {
  const { rows } = await e.db.query<{ purged_at: Date }>("select purged_at from proof_purges where job_id = $1", [jobId]);
  return rows[0]?.purged_at ?? null;
}
