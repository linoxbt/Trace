import { NextResponse } from "next/server";
import { LATEST_MIGRATION, systemStatus } from "@trace/db";
import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";

/** The worker runs every minute: five minutes without a run means it has stopped. */
const TICK_STALE_S = 300;

/**
 * GET /api/health: for an uptime monitor. 200 when the database answers, the
 * worker ran in the last five minutes and the schema is current; 503 with the
 * reasons otherwise. Right after a deploy the schema can lag for a minute,
 * until the worker's next run applies it.
 */
export async function GET() {
  try {
    const { lastTickAt, migration } = await systemStatus(engine().db).catch(async () => {
      // Before migration 009 lands there's no heartbeat table; the database is still up.
      await engine().db.query("select 1");
      return { lastTickAt: null, migration: null };
    });
    // The worker runs every minute; seconds since its last run show it's alive.
    const tickAgeS = lastTickAt ? Math.round((Date.now() - lastTickAt.getTime()) / 1000) : null;
    const problems = [
      ...(tickAgeS === null || tickAgeS > TICK_STALE_S ? ["worker_stale"] : []),
      ...(migration === null || migration < LATEST_MIGRATION ? ["schema_behind"] : []),
    ];
    return NextResponse.json(
      { ok: problems.length === 0, problems, migration, expected_migration: LATEST_MIGRATION, tick_age_s: tickAgeS },
      { status: problems.length ? 503 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    // The driver's message names the failure (host, auth, TLS) without the password.
    console.error(JSON.stringify({ level: "error", msg: "health: database unreachable", err: err instanceof Error ? err.message : String(err) }));
    // Only the driver's short code (e.g. 28P01, ENOTFOUND): enough to diagnose, nothing secret.
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code).slice(0, 16) : "unknown";
    return NextResponse.json({ ok: false, code }, { status: 503 });
  }
}
