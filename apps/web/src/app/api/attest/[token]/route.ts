import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { signAttestation } from "@trace/engine";
import { engine } from "@/server/engine";
import { env } from "@/server/env";
import { errorResponse, HttpError } from "@/server/http";

/**
 * POST /api/attest/:token: the named person signs off a line. No account is
 * needed: the single-use link is the credential. Name, time and IP are recorded.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const origin = req.headers.get("origin");
    if (!origin || (origin !== new URL(env().APP_URL).origin && origin !== req.nextUrl.origin)) throw new HttpError(403, "bad_origin", "cross-site request refused");
    const { token } = await ctx.params;
    const { name } = z.object({ name: z.string().min(2).max(80) }).parse(await req.json());
    const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const r = await signAttestation(engine(), token, { name, ip });
    return NextResponse.json({ verdict: r.verdict });
  } catch (err) {
    return errorResponse(err);
  }
}
