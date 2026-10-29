import { NextResponse } from "next/server";
import { disconnectPayee, startPayeeConnect } from "@trace/engine";
import { engine } from "@/server/engine";
import { env } from "@/server/env";
import { HttpError, route } from "@/server/http";

/** POST /api/paypal/connect: a one-time PayPal sign-up link that links the account you'll be paid into. */
export const POST = route(async (_req, { user }) => {
  if (user.anonymous) throw new HttpError(403, "sign_in", "sign in with your email to get paid");
  return startPayeeConnect(engine(), user.id, `${env().APP_URL}/api/paypal/return`);
});

/** DELETE /api/paypal/connect: unlink. Jobs already held keep paying the account they were approved with. */
export const DELETE = route(async (_req, { user }) => {
  await disconnectPayee(engine(), user.id);
  return NextResponse.json({ ok: true });
});
