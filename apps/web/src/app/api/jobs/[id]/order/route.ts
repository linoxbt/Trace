import { createOrder } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

/** POST /api/jobs/:id/order: the PayPal button's createOrder. Amounts come from the stored lines only. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => createOrder(engine(), params.id, user.id));
