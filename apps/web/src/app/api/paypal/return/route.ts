import { NextResponse, type NextRequest } from "next/server";
import { refreshPayee } from "@trace/engine";
import { currentUser } from "@/server/auth";
import { engine } from "@/server/engine";

/**
 * GET /api/paypal/return: PayPal sends the tradesperson back here after
 * sign-up. The query string is ignored: PayPal itself is asked which account
 * was linked under this person's tracking ID.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  const to = (q: string) => NextResponse.redirect(new URL(`/settings?paypal=${q}#get-paid`, req.nextUrl.origin));
  if (!user) return NextResponse.redirect(new URL("/sign-in?next=/settings", req.nextUrl.origin));
  try {
    const s = await refreshPayee(engine(), user.id);
    return to(s.state === "ready" ? "connected" : s.state === "pending" ? "pending" : "unfinished");
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "paypal return failed", err: String(err) }));
    return to("error");
  }
}
