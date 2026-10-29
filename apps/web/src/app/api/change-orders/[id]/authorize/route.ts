import { z } from "zod";
import { authorizeChangeOrder } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

/** POST /api/change-orders/:id/authorize: the PayPal button's onApprove. Places the change order's own hold. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const { orderId } = await body(req, z.object({ orderId: z.string().min(1).max(64) }));
  const co = await authorizeChangeOrder(engine(), params.id, orderId, user.id);
  return { status: co.status };
});
