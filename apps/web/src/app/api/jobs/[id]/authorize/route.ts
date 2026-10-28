import { z } from "zod";
import { authorizeJob } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, route } from "@/server/http";

const Input = z.object({ orderId: z.string().min(5).max(64) });

/** POST /api/jobs/:id/authorize: the PayPal button's onApprove. Places the hold. */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const { orderId } = await body(req, Input);
  const auth = await authorizeJob(engine(), params.id, orderId, user.id);
  return { authorizationId: auth.paypal_auth_id, amountCents: auth.amount_cents, expiresAt: auth.expires_at };
});
