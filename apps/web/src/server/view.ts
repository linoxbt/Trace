import "server-only";
import * as store from "@trace/db";
import { BUILTIN_RULES, sum, type ProofSpec, type ProofType } from "@trace/core";
import { payeeStatus, rulesForJob } from "@trace/engine";
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
    /** The job type: sets the words for each side and the starting lines. */
    category: store.JobRow["category"];
    disputed: boolean;
    reviewWindowS: number;
    totalCents: number;
    closeDropLineIds: string[];
    closeConfirmedByTrades: boolean;
    closeConfirmedByHomeowner: boolean;
    /** Work added after the money was held, each with its own hold. */
    changeOrders: { id: string; code: string; status: string; totalCents: number; lines: { code: string; title: string; priceCents: number; criterion: string }[] }[];
    /** PayPal disputes on this job, newest first. */
    disputes: { id: string; paypalId: string; status: string | null; filed: boolean }[];
    /** Where this job's money goes: the tradesperson's own PayPal once it can take payments. */
    payee: { state: "none" | "pending" | "ready"; merchantId: string | null };
  };
  role: Role;
  money: MoneyView;
  /** Payments PayPal took on this job, oldest first. */
  captures: { id: string; amountCents: number; status: string; lines: string[]; paypalId: string | null; at: string; final: boolean }[];
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
    /** Text in the latest proof was aimed at the inspector, or steered the verdict (Tripwire). */
    injection: { excerpt: string | null; maskedUrl: string | null; boxes: { x: number; y: number; w: number; h: number }[] } | null;
    /** How the line is proved, and what its latest proof showed. */
    proof: ProofView;
    /** The change order that added this line, if one did. */
    changeOrder: string | null;
  }[];
  guard: GuardView;
  events: { id: number; actor: string; type: string; data: Record<string, unknown> | null; at: string }[];
}

export interface ProofView {
  type: ProofType;
  spec: ProofSpec | null;
  /** Video: the clip's frames after the first (which is afterUrl). */
  frames: string[];
  /** Document or file deliverable. */
  file: { url: string; name: string; mime: string } | null;
  /** Link deliverable. */
  link: { url: string; status: number | null } | null;
  /** What the check read off the proof (a reading's value, a document's fields). */
  extracted: { value: number | null; unit: string | null; vendor: string | null; date: string | null; total_cents: number | null; items: string[] } | null;
  attestation: { email: string; statement: string; signedName: string | null; signedAt: string | null } | null;
}

export interface GuardView {
  decisions: { id: number; type: string; amountCents: number; outcome: "ALLOW" | "REQUIRE_APPROVAL" | "DENY"; reasons: string[]; at: string; executed: boolean }[];
  approvals: {
    id: string;
    status: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";
    approver: "homeowner" | "tradesperson" | "both";
    expiresAt: string;
    type: string;
    amountCents: number;
    reasons: string[];
    /** The rules that asked, in their owners' own words. */
    rules: { id: string; why: string }[];
    approvedBy: ("homeowner" | "tradesperson")[];
    /** Whether the signed-in user's tap is one this request still needs. */
    canAnswer: boolean;
  }[];
  scopeFlags: { line: string; text: string; why: string }[];
  /** Presets and people's own rules in force on this job; the built-ins always are. */
  rules: { id: string; english: string; owner: string; effect: string }[];
  builtins: { id: string; label: string }[];
}

/** Everything a job page shows, for one of its two parties. Photo links are 10-minute signed URLs. */
export async function jobView(jobId: string, userId: string): Promise<JobView> {
  const e = engine();
  const job = await store.getJob(e.db, jobId);
  if (!job) throw new HttpError(404, "not_found", "job not found");
  const role: Role | null =
    job.trades_id === userId && job.homeowner_id === userId ? "both" : job.trades_id === userId ? "tradesperson" : job.homeowner_id === userId ? "homeowner" : null;
  if (!role) throw new HttpError(404, "not_found", "job not found");

  const [lines, photos, events, auth, decisions, approvals, inForce, trades] = await Promise.all([
    store.getLines(e.db, jobId),
    store.getPhotos(e.db, jobId),
    store.getEvents(e.db, jobId),
    store.getBaseAuthorization(e.db, jobId),
    store.decisionsForJob(e.db, jobId),
    store.approvalsForJob(e.db, jobId),
    rulesForJob(e, job),
    payeeStatus(e, job.trades_id),
  ]);
  // Once the order exists its payee is frozen; before that, the tradesperson's linked account.
  const payee = job.payee_merchant_id
    ? { state: "ready" as const, merchantId: job.payee_merchant_id }
    : { state: trades.state, merchantId: trades.state === "ready" ? trades.merchantId : null };
  const verdicts = await e.db.query<{ line_id: string; verdict: string; reasons: string[]; observation: { homeowner_reason?: string; region?: unknown; extracted?: ProofView["extracted"] } }>(
    `select distinct on (v.line_id) v.line_id, v.verdict, v.reasons, v.observation
     from verdicts v join lines l on l.id = v.line_id where l.job_id = $1 and not v.masked
     order by v.line_id, v.created_at desc, v.pass desc`,
    [jobId],
  );
  const verdictBy = new Map(verdicts.rows.map((v) => [v.line_id, v]));
  const [proofItems, attestations] = await Promise.all([
    e.db.query<store.ProofItemRow>("select * from proof_items where job_id = $1 order by created_at, id", [jobId]),
    e.db.query<store.AttestationRow>("select a.* from attestations a join lines l on l.id = a.line_id where l.job_id = $1 order by a.created_at", [jobId]),
  ]);

  const signPath = (path: string | null) => (path ? e.storage.signedUrl(path, 600).catch(() => null) : Promise.resolve(null));
  async function proofView(l: store.LineRow, after: store.PhotoRow | undefined, extracted: ProofView["extracted"]): Promise<ProofView> {
    const mine = proofItems.rows.filter((p) => p.line_id === l.id);
    const since = after ? after.taken_at.getTime() - 60_000 : 0;
    const frames = mine.filter((p) => p.kind === "video_frame" && p.created_at.getTime() >= since);
    const doc = [...mine].reverse().find((p) => p.kind === "document" || p.kind === "file" || p.kind === "url");
    const att = [...attestations.rows].reverse().find((a) => a.line_id === l.id);
    const meta = (doc?.meta ?? {}) as { name?: string; mime?: string; url?: string; final_url?: string; status?: number };
    return {
      type: l.proof_type,
      spec: l.proof_spec,
      frames: (await Promise.all(frames.map((f) => signPath(f.storage_path)))).filter((u): u is string => !!u),
      file: doc && doc.kind !== "url" && doc.storage_path ? { url: (await signPath(doc.storage_path)) ?? "", name: meta.name ?? "file", mime: meta.mime ?? "" } : null,
      link: doc?.kind === "url" ? { url: meta.final_url ?? meta.url ?? "", status: meta.status ?? null } : null,
      extracted,
      attestation: att ? { email: att.email, statement: att.statement, signedName: att.signed_name, signedAt: att.signed_at?.toISOString() ?? null } : null,
    };
  }
  const sign = async (p: store.PhotoRow | undefined) => (p?.storage_path ? e.storage.signedUrl(p.storage_path, 600).catch(() => null) : null);
  const firstBefore = photos.find((p) => p.kind === "before");

  // Released = captures PayPal accepted. One still in flight is neither released nor shown as free.
  // Every hold on the job: the original scope's, and each change order's.
  const holds = await store.authorizationsForJob(e.db, jobId);
  const { rows: relRows } = await e.db.query<{ n: number }>(
    "select coalesce(sum(c.amount_cents),0)::int8 as n from captures c join authorizations a on a.id = c.authorization_id where a.job_id = $1 and c.status in ('COMPLETED','PENDING')",
    [jobId],
  );
  const released = relRows[0]!.n;
  const held = holds.reduce((n, h) => n + h.amount_cents, 0);
  // Money still held: what each open hold hasn't captured.
  const open = holds.filter((h) => h.status === "CREATED" || h.status === "PARTIALLY_CAPTURED");
  const capByHold = new Map(
    (
      await e.db.query<{ authorization_id: string; n: number }>(
        "select authorization_id, coalesce(sum(amount_cents),0)::int8 as n from captures where authorization_id = any($1::uuid[]) and status in ('COMPLETED','PENDING') group by 1",
        [holds.map((h) => h.id)],
      )
    ).rows.map((r) => [r.authorization_id, r.n]),
  );
  const stillHeld = open.reduce((n, h) => n + Math.max(0, h.amount_cents - (capByHold.get(h.id) ?? 0)), 0);
  const changeOrders = await store.changeOrdersForJob(e.db, jobId);

  return {
    job: {
      id: job.id,
      status: job.status,
      address: job.address,
      homeownerEmail: job.homeowner_email,
      currency: job.currency,
      demo: job.demo,
      category: job.category,
      disputed: job.disputed,
      reviewWindowS: job.review_window_s,
      totalCents: sum(lines.map((l) => l.price_cents)),
      closeDropLineIds: job.close_drop_line_ids ?? [],
      closeConfirmedByTrades: !!job.close_trades_at,
      closeConfirmedByHomeowner: !!job.close_homeowner_at,
      payee,
      changeOrders: changeOrders.map((c) => ({
        id: c.id,
        code: c.code,
        status: c.status,
        totalCents: c.total_cents,
        lines: c.lines.map((l) => ({ code: l.code, title: l.title, priceCents: l.priceCents, criterion: (l.acceptance as { criterion: string }).criterion })),
      })),
      disputes: (
        await e.db.query<{ id: string; paypal_dispute_id: string; status: string | null; filed_at: Date | null }>(
          "select id, paypal_dispute_id, status, filed_at from disputes where job_id = $1 order by created_at desc",
          [job.id],
        )
      ).rows.map((d) => ({ id: d.id, paypalId: d.paypal_dispute_id, status: d.status, filed: !!d.filed_at })),
    },
    role,
    money: {
      heldCents: held,
      releasedCents: released,
      stillHeldCents: stillHeld,
      currency: job.currency,
      authorizationStatus: auth?.status ?? null,
      expiresAt: auth?.expires_at?.toISOString() ?? null,
    },
    captures: auth
      ? (
          await e.db.query<store.CaptureRow>(
            "select c.* from captures c join authorizations a on a.id = c.authorization_id where a.job_id = $1 and c.status <> 'FAILED' order by c.created_at",
            [jobId],
          )
        ).rows.map((c) => ({
          id: c.id,
          amountCents: c.amount_cents,
          status: c.status,
          lines: lines.filter((l) => c.line_ids.includes(l.id)).map((l) => l.code),
          paypalId: c.paypal_capture_id,
          at: c.created_at.toISOString(),
          final: c.final,
        }))
      : [],
    lines: await Promise.all(
      lines.map(async (l) => {
        const v = verdictBy.get(l.id);
        const before = photos.find((p) => p.kind === "before" && p.line_id === l.id) ?? firstBefore;
        const after = [...photos].reverse().find((p) => p.line_id === l.id && p.kind !== "before" && p.kind !== "masked");
        const masked = after ? photos.find((p) => p.kind === "masked" && p.masked_of === after.id) : undefined;
        const scan = after?.text_scan as { texts?: { box: { x: number; y: number; w: number; h: number } }[] } | null | undefined;
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
          injection: l.injection_flag
            ? { excerpt: l.injection_excerpt, maskedUrl: await sign(masked), boxes: (scan?.texts ?? []).map((t) => t.box) }
            : null,
          proof: await proofView(l, after, v?.observation.extracted ?? null),
          changeOrder: l.change_order_id ? (changeOrders.find((c) => c.id === l.change_order_id)?.code ?? null) : null,
        };
      }),
    ),
    guard: {
      decisions: decisions.map((d) => ({
        id: d.id,
        type: d.action.type,
        amountCents: d.action.amount_cents,
        outcome: d.outcome,
        reasons: d.decision.reasons_plain,
        at: d.decided_at.toISOString(),
        executed: d.executed,
      })),
      approvals: approvals.map((a) => {
        const approvedBy = [...new Set(a.approvals.map((x) => x.by))];
        const needed = a.approver === "both" ? (["homeowner", "tradesperson"] as const) : ([a.approver] as const);
        const mine = role === "both" ? needed : needed.filter((n) => n === role);
        return {
          id: a.id,
          status: a.status,
          approver: a.approver,
          expiresAt: a.expires_at.toISOString(),
          type: a.action.type,
          amountCents: a.action.amount_cents,
          reasons: a.decision.reasons_plain,
          rules: a.decision.rule_hits.filter((h) => h.effect === "require_approval" && !h.satisfied).map((h) => ({ id: h.rule_id, why: h.why })),
          approvedBy,
          canAnswer: a.status === "PENDING" && mine.some((m) => !approvedBy.includes(m)),
        };
      }),
      scopeFlags: job.scope_flags ?? [],
      rules: inForce.map((r) => ({ id: r.id, english: r.english, owner: r.owner, effect: r.effect })),
      builtins: BUILTIN_RULES.map((b) => ({ id: b.id, label: b.label })),
    },
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
       (select sum(a.amount_cents)::int8 from authorizations a where a.job_id = j.id) as held,
       coalesce((select sum(c.amount_cents) from captures c join authorizations a on a.id = c.authorization_id where a.job_id = j.id and c.status in ('COMPLETED','PENDING')),0)::int8 as released
     from jobs j
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
