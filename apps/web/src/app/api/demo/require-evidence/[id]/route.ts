import { requireEvidenceDemo } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

/** POST /api/demo/require-evidence/:id: demo mode only. PayPal's sandbox step that asks the seller for evidence. */
export const POST = route<{ id: string }>(async (_req, { params, user }) => requireEvidenceDemo(engine(), params.id, user.id));
