import { requestRelease } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

/** POST /api/jobs/:id/release-request: open the homeowner's review window on proved lines. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => requestRelease(engine(), params.id, user.id));
