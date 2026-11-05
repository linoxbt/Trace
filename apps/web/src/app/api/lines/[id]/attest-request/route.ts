import { getLine } from "@trace/db";
import { emailAttestation, requestAttestation } from "@trace/engine";
import { engine } from "@/server/engine";
import { env } from "@/server/env";
import { route } from "@/server/http";

/**
 * POST /api/lines/:id/attest-request: a single-use sign-off link for the person
 * named on the line. Emailed to them when email is set up, and then not shown
 * here; otherwise shown once, for the tradesperson to send.
 */
export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  const e = engine();
  const a = await requestAttestation(e, params.id, user.id);
  const link = `${env().APP_URL}/attest/${a.token}`;
  const line = (await getLine(e.db, params.id))!;
  const emailed = await emailAttestation(e, { jobId: line.job_id, email: a.email, statement: a.statement, lineTitle: line.title, link, expiresAt: a.expiresAt });
  return { link: emailed ? null : link, emailed, email: a.email, statement: a.statement, expiresAt: a.expiresAt.toISOString() };
});
