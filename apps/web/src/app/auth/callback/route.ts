import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/server/auth";

/** Magic-link landing: swap the one-time code for a session, then go where the link pointed. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/jobs";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/jobs";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, req.nextUrl.origin));
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", req.nextUrl.origin));
}
