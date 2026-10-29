import { z } from "zod";
import { getCapture, jobIdOfCapture, mustGetJob } from "@trace/db";
import { guardedRefund } from "@trace/engine";
import { engine } from "@/server/engine";
import { body, HttpError, route } from "@/server/http";

/**
 * POST /api/captures/:id/refund: ask to refund a payment, in full or in part.
 * Rule B8 always asks both sides first, so this opens an approval card for
 * each of them; the refund runs once both have tapped Approve.
 */
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const { amountCents } = await body(req, z.object({ amountCents: z.number().int().positive().optional() }));
  const e = engine();
  const cap = await getCapture(e.db, params.id);
  const jobId = cap ? await jobIdOfCapture(e.db, cap.id) : null;
  if (!cap || !jobId) throw new HttpError(404, "not_found", "payment not found");
  const job = await mustGetJob(e.db, jobId);
  const side = user.id === job.trades_id ? "tradesperson" : user.id === job.homeowner_id ? "homeowner" : null;
  if (!side) throw new HttpError(404, "not_found", "payment not found");
  // The default request id is the capture and amount, so asking twice is the same request, not a second refund.
  const r = await guardedRefund(e, jobId, { kind: side, userId: user.id }, cap.id, { amountCents });
  return { outcome: r.outcome, reasons: r.reasons, refunded: r.refunded };
});
