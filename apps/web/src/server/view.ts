import "server-only";
import * as store from "@trace/db";
import { sum } from "@trace/core";
import { engine } from "./engine";
import { HttpError } from "./http";

export type Role = "tradesperson" | "homeowner" | "both";

export interface MoneyView {
  heldCents: number;
  releasedCents: number;
  stillHeldCents: number;
  currency: string;
  authorizationStatus: string | null;
  expiresAt: string | null;
}

export interface JobView {
  job: {
    id: string;
    status: store.JobRow["status"];
    address: string;
    homeownerEmail: string;
    currency: string;
    demo: boolean;
    disputed: boolean;
    reviewWindowS: number;
    totalCents: number;
    closeDropLineIds: string[];
    closeConfirmedByTrades: boolean;
    closeConfirmedByHomeowner: boolean;
  };
  role: Role;
  money: MoneyView;
  lines: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    priceCents: number;
    status: store.LineRow["status"];
    criterion: string;
    mustShow: string[];
    mustNotShow: string[];
    framing: string;
    verifiableByPhoto: boolean;
    reviewDueAt: string | null;
    flagNote: string | null;
    verdict: { verdict: string; reasons: string[]; homeownerReason: string; region: unknown } | null;
    beforeUrl: string | null;
    afterUrl: string | null;
  }[];
  events: { id: number; actor: string; type: string; data: Record<string, unknown> | null; at: string }[];
}

/** Everything a job page shows, for one of its two parties. Photo links are 10-minute signed URLs. */
export async function jobView(jobId: string, userId: string): Promise<JobView> {
  const e = engine();
  const job = await store.getJob(e.db, jobId);
  if (!job) throw new HttpError(404, "not_found", "job not found");
  const role: Role | null =
    job.trades_id === userId && job.homeowner_id === userId ? "both" : job.trades_id === userId ? "tradesperson" : job.homeowner_id === userId ? "homeowner" : null;
  if (!role) throw new HttpError(404, "not_found", "job not found");

  const [lines, photos, events, auth] = await Promise.all([
    store.getLines(e.db, jobId),
    store.getPhotos(e.db, jobId),
    store.getEvents(e.db, jobId),
    store.getBaseAuthorization(e.db, jobId),
  ]);
  const verdicts = await e.db.query<{ line_id: string; verdict: string; reasons: string[]; observation: { homeowner_reason?: string; region?: unknown } }>(
    `select distinct on (v.line_id) v.line_id, v.verdict, v.reasons, v.observation
     from verdicts v join lines l on l.id = v.line_id where l.job_id = $1
     order by v.line_id, v.created_at desc, v.pass desc`,
    [jobId],
  );
  const verdictBy = new Map(verdicts.rows.map((v) => [v.line_id, v]));

  const sign = async (p: store.PhotoRow | undefined) => (p?.storage_path ? e.storage.signedUrl(p.storage_path, 600).catch(() => null) : null);
  const firstBefore = photos.find((p) => p.kind === "before");

  // Released = captures PayPal accepted. One still in flight is neither released nor shown as free.
  let released = 0;
  if (auth) {
    const { rows } = await e.db.query<{ n: number }>(
      "select coalesce(sum(amount_cents),0)::int8 as n from captures where authorization_id = $1 and status in ('COMPLETED','PENDING')",
      [auth.id],
    );
    released = rows[0]!.n;
  }
  const held = auth?.amount_cents ?? 0;
  const closed = auth?.status === "VOIDED" || auth?.status === "CAPTURED";

  return {
    job: {
      id: job.id,
      status: job.status,
      address: job.address,
      homeownerEmail: job.homeowner_email,
      currency: job.currency,
      demo: job.demo,
      disputed: job.disputed,
      reviewWindowS: job.review_window_s,
      totalCents: sum(lines.map((l) => l.price_cents)),
      closeDropLineIds: job.close_drop_line_ids ?? [],
      closeConfirmedByTrades: !!job.close_trades_at,
      closeConfirmedByHomeowner: !!job.close_homeowner_at,
    },
    role,
    money: {
      heldCents: held,
      releasedCents: released,
      stillHeldCents: closed ? 0 : Math.max(0, held - released),
      currency: job.currency,
      authorizationStatus: auth?.status ?? null,
      expiresAt: auth?.expires_at?.toISOString() ?? null,
    },
    lines: await Promise.all(
      lines.map(async (l) => {
        const v = verdictBy.get(l.id);
        const before = photos.find((p) => p.kind === "before" && p.line_id === l.id) ?? firstBefore;
        const after = [...photos].reverse().find((p) => p.line_id === l.id && p.kind !== "before");
        return {
          id: l.id,
          code: l.code,
          title: l.title,
          description: l.description,
          priceCents: l.price_cents,
          status: l.status,
          criterion: l.acceptance.criterion,
          mustShow: l.acceptance.must_show,
          mustNotShow: l.acceptance.must_not_show,
          framing: l.acceptance.framing,
          verifiableByPhoto: l.verifiable_by_photo,
          reviewDueAt: l.review_due_at?.toISOString() ?? null,
          flagNote: l.flag_note,
          verdict: v ? { verdict: v.verdict, reasons: v.reasons, homeownerReason: v.observation.homeowner_reason ?? "", region: v.observation.region ?? null } : null,
          beforeUrl: await sign(before),
          afterUrl: await sign(after),
        };
      }),
    ),
    events: events.map((ev) => ({ id: ev.id, actor: ev.actor, type: ev.type, data: ev.data, at: ev.at.toISOString() })),
  };
}

/** The signed-in user's jobs, newest first, with what is held and released on each. */
export async function myJobs(userId: string) {
  const { rows } = await engine().db.query<{
    id: string;
    address: string;
    status: string;
    trades_id: string;
    total: number;
    held: number | null;
    released: number;
    lines: number;
    paid: number;
    created_at: Date;
  }>(
    `select j.id, j.address, j.status, j.trades_id, j.created_at,
       (select coalesce(sum(price_cents),0)::int8 from lines where job_id = j.id) as total,
       (select count(*)::int8 from lines where job_id = j.id) as lines,
       (select count(*)::int8 from lines where job_id = j.id and status = 'CAPTURED') as paid,
       a.amount_cents as held,
       coalesce((select sum(c.amount_cents) from captures c where c.authorization_id = a.id and c.status in ('COMPLETED','PENDING')),0)::int8 as released
     from jobs j left join authorizations a on a.job_id = j.id and a.kind = 'base'
     where $1 in (j.trades_id, j.homeowner_id)
     order by j.created_at desc limit 50`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    address: r.address,
    status: r.status,
    role: r.trades_id === userId ? ("tradesperson" as const) : ("homeowner" as const),
    totalCents: r.total,
    heldCents: r.held ?? 0,
    releasedCents: r.released,
    lines: r.lines,
    paid: r.paid,
    createdAt: r.created_at.toISOString(),
  }));
}
