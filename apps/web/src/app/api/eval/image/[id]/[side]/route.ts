import { NextResponse, type NextRequest } from "next/server";
import { CASES, caseImages } from "@trace/eval/verifier";

/** GET /api/eval/image/:case/:side: a verifier eval case's before- or after-photo, for the /accuracy page. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; side: string }> }) {
  const { id, side } = await ctx.params;
  const c = CASES.find((x) => x.id === id);
  if (!c || (side !== "before" && side !== "after")) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const loadPhoto = async (name: string) => {
    const res = await fetch(new URL(`/photos/${encodeURIComponent(name)}.webp`, req.nextUrl.origin));
    if (!res.ok) throw new Error(`demo photo ${name} answered ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const images = await caseImages(c, loadPhoto);
  return new NextResponse(new Uint8Array(images[side]), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
