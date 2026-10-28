import { NextResponse } from "next/server";
import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await engine().db.query("select 1");
    return NextResponse.json({ ok: true });
  } catch (err) {
    // The driver's message names the failure (host, auth, TLS) without the password.
    console.error(JSON.stringify({ level: "error", msg: "health: database unreachable", err: err instanceof Error ? err.message : String(err) }));
    // Only the driver's short code (e.g. 28P01, ENOTFOUND): enough to diagnose, nothing secret.
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code).slice(0, 16) : "unknown";
    return NextResponse.json({ ok: false, code }, { status: 503 });
  }
}
