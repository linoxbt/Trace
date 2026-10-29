import { z } from "zod";
import { answerApproval } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

/**
 * POST /api/approvals/:id: approve or deny a money move the guard held back.
 * Approving re-runs the guard on the same action; it never skips the checks.
 */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const b = await body(req, z.object({ approve: z.boolean() }));
  return answerApproval(engine(), params.id, user.id, b.approve);
});
