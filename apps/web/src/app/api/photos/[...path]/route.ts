import { mustGetJob } from "@trace/db";
import { engine } from "@/server/engine";
import { HttpError, route } from "@/server/http";

const TYPES: Record<string, string> = { jpg: "image/jpeg", pdf: "application/pdf", png: "image/png", webp: "image/webp", txt: "text/plain; charset=utf-8" };

/**
 * GET /api/photos/job/<jobId>/<kind>/<file>: a job's photo, proof file or
 * evidence PDF, for its two parties only. Served as a download-safe type.
 */
export const GET = route<{ path: string[] }>(async (_req, { params, user }) => {
  const [root, jobId, kind, file] = params.path;
  if (root !== "job" || !jobId || !kind || !file || params.path.length !== 4) throw new HttpError(404, "not_found", "photo not found");
  const e = engine();
  const job = await mustGetJob(e.db, jobId);
  if (user.id !== job.trades_id && user.id !== job.homeowner_id) throw new HttpError(404, "not_found", "photo not found");
  const bytes = await e.storage.get(params.path.join("/")).catch(() => {
    throw new HttpError(404, "not_found", "photo not found");
  });
  const type = TYPES[file.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      // Uploaded text and unknown files can't run as a page on this origin. (PDFs need the browser's viewer.)
      ...(type.startsWith("text/") || type === "application/octet-stream" ? { "Content-Security-Policy": "sandbox", "Content-Disposition": "attachment" } : {}),
    },
  });
});
