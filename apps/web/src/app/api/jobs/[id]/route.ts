import { route } from "@/server/http";
import { jobView } from "@/server/view";

/** GET /api/jobs/:id: the job page's data, for its two parties only. */
export const GET = route<{ id: string }>(async (_req, { params, user }) => jobView(params.id, user.id));
