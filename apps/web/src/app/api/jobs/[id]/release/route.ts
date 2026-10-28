import { getJob } from "@trace/db";
import { release } from "@trace/engine";
import { engine } from "@/server/engine";
import { HttpError, route } from "@/server/http";

/** POST /api/jobs/:id/release: the homeowner releases every approved line now. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  const e = engine();
  const job = await getJob(e.db, params.id);
  if (!job || job.homeowner_id !== user.id) throw new HttpError(404, "not_found", "job not found");
  return release(e, params.id, "homeowner");
});
