import { NextResponse } from "next/server";
import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await engine().db.query("select 1");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
