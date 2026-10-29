import { createChangeOrderOrder } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

/** POST /api/change-orders/:id/order: the PayPal button's createOrder for a change order. Amounts come from its frozen lines. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => createChangeOrderOrder(engine(), params.id, user.id));
