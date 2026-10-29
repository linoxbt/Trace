import { fileDispute } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

export const maxDuration = 60;

/** POST /api/disputes/:id/file: "File evidence". Sends the notes and PDF to PayPal, through the guard. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  const r = await fileDispute(engine(), params.id, user.id);
  return { filed: r.filed, outcome: r.outcome, reasons: r.reasons, dispute: r.dispute };
});
