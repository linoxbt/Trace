import { mustGetJob } from "@trace/db";
import { engine } from "@/server/engine";
import { HttpError, route } from "@/server/http";

/** GET /api/photos/job/<jobId>/<kind>/<photoId>.jpg: a job's photo, for its two parties only. */
export const GET = route<{ path: string[] }>(async (_req, { params, user }) => {
  const [root, jobId, kind, file] = params.path;
  if (root !== "job" || !jobId || !kind || !file || params.path.length !== 4) throw new HttpError(404, "not_found", "photo not found");
  const e = engine();
  const job = await mustGetJob(e.db, jobId);
  if (user.id !== job.trades_id && user.id !== job.homeowner_id) throw new HttpError(404, "not_found", "photo not found");
  const bytes = await e.storage.get(params.path.join("/")).catch(() => {
    throw new HttpError(404, "not_found", "photo not found");
  });
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" },
  });
});
