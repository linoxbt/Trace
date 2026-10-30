import { NextResponse, type NextRequest } from "next/server";
import { engine } from "@/server/engine";
import { env } from "@/server/env";
import { evalStep, evalStepAllowed } from "@/server/eval-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/eval/step: one step of the evals (the photo verifier set and the
 * planted-note set). Called by the scheduled worker, with a key derived from
 * the PayPal secret both already hold; nobody else can spend model calls here.
 */
export async function POST(req: NextRequest) {
  if (!evalStepAllowed(env().PAYPAL_CLIENT_SECRET, req.headers.get("x-trace-eval"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const loadPhoto = async (name: string) => {
    const res = await fetch(new URL(`/photos/${encodeURIComponent(name)}.webp`, req.nextUrl.origin));
    if (!res.ok) throw new Error(`demo photo ${name} answered ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const done = await evalStep(engine(), loadPhoto);
  console.log(JSON.stringify({ level: "info", msg: "eval step", done }));
  return NextResponse.json({ done });
}
