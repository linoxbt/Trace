import { z } from "zod";
import { draftScope } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

export const maxDuration = 60;

/** POST /api/jobs/:id/scope/draft: the AI drafts lines from the before-photos and a description. Nothing is saved. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const { description } = await body(req, z.object({ description: z.string().max(4000).default("") }));
  return draftScope(engine(), params.id, user.id, description);
});
