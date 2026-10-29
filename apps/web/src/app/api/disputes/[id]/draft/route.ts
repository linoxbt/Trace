import { draftDispute } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

export const maxDuration = 60;

/** POST /api/disputes/:id/draft: the dispute assistant drafts the response and renders the evidence PDF. It never files. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  const e = engine();
  return draftDispute(e, params.id, user.id, e.drafter);
});
