import { payeeStatus, refreshPayee } from "@trace/engine";
import { engine } from "@/server/engine";
import { route } from "@/server/http";

/** GET /api/paypal/status: what Trace last heard. POST asks PayPal again. */
export const GET = route(async (_req, { user }) => payeeStatus(engine(), user.id));
export const POST = route(async (_req, { user }) => refreshPayee(engine(), user.id));
