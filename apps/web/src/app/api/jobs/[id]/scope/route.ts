import { z } from "zod";
import { saveScope, ScopeLineBody, sendScope } from "@trace/engine";
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
  if (input.send) await sendScope(e, params.id, user.id);
  return { ok: true, sent: input.send };
});
