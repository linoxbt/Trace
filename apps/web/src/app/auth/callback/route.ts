import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/server/auth";
import { env } from "@/server/env";

/** Magic-link landing: swap the one-time code for a session, then go where the link pointed. */
export async function GET(req: NextRequest) {
  // Back to the site's own address: behind Netlify, the request's origin can be
  // the per-deploy host, where the session cookie just set here isn't sent.
  const site = env().APP_URL;
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, site));
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", site));
}
