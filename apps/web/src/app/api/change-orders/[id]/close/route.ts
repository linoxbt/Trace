import { closeChangeOrder } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

/** POST /api/change-orders/:id/close: the client declines, or the tradesperson withdraws, a change order not yet held. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  const co = await closeChangeOrder(engine(), params.id, user.id);
  return { status: co.status };
});
