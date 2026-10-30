import { NextResponse } from "next/server";
import { systemStatus } from "@trace/db";
import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { lastTickAt, migration } = await systemStatus(engine().db).catch(async () => {
      // Before migration 009 lands there's no heartbeat table; the database is still up.
      await engine().db.query("select 1");
      return { lastTickAt: null, migration: null };
    });
    // The worker runs every minute; seconds since its last run show it's alive.
    const tickAgeS = lastTickAt ? Math.round((Date.now() - lastTickAt.getTime()) / 1000) : null;
    return NextResponse.json({ ok: true, migration, tick_age_s: tickAgeS });
  } catch (err) {
    // The driver's message names the failure (host, auth, TLS) without the password.
    console.error(JSON.stringify({ level: "error", msg: "health: database unreachable", err: err instanceof Error ? err.message : String(err) }));
    // Only the driver's short code (e.g. 28P01, ENOTFOUND): enough to diagnose, nothing secret.
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code).slice(0, 16) : "unknown";
    return NextResponse.json({ ok: false, code }, { status: 503 });
  }
}
