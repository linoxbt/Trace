import { z } from "zod";
import { saveDisputeNotes } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

/** PUT /api/disputes/:id/notes: the tradesperson's edits to the response; the PDF is re-rendered. */
export const PUT = route<{ id: string }>(async (req, { params, user }) => {
  const { notes } = await body(req, z.object({ notes: z.string().min(1).max(2000) }));
  return saveDisputeNotes(engine(), params.id, user.id, notes);
});
