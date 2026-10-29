import { disputeView } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

/** GET /api/disputes/:id: the dispute, its drafted response and evidence pack, for the job's parties. */
export const GET = route<{ id: string }>(async (_req, { params, user }) => disputeView(engine(), params.id, user.id));
