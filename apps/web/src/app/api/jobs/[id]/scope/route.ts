import { z } from "zod";
import { emailJobInvite, saveScope, ScopeLineBody, sendScope } from "@trace/engine";
import { env } from "@/server/env";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

const Input = z.object({
  lines: z.array(ScopeLineBody).min(1).max(8),
  /** true: freeze and send for approval. */
  send: z.boolean().default(false),
});

/** PUT /api/jobs/:id/scope: save the edited lines; with send, hash the scope and move to AWAITING_APPROVAL. */
export const PUT = route<{ id: string }>(async (req, { params, user }) => {
  const input = await body(req, Input);
  const e = engine();
  await saveScope(e, params.id, user.id, input.lines.map((l) => ({ ...l, description: l.description ?? null })));
  if (!input.send) return { ok: true, sent: false, emailed: false };
  await sendScope(e, params.id, user.id);
  // The client gets the job's link by email when email is set up; the page offers it to share either way.
  const emailed = await emailJobInvite(e, params.id, `${env().APP_URL}/jobs/${params.id}`);
  return { ok: true, sent: true, emailed };
});
