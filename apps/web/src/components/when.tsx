"use client";

import { clock, when } from "@/lib/format";
import { useZone } from "@/lib/use-zone";

/** A timestamp in the viewer's own time zone, without a hydration mismatch. */
export function When({ iso, only }: { iso: string; only?: "time" }) {
  const zone = useZone();
  return <time dateTime={iso}>{only === "time" ? clock(iso, zone) : when(iso, zone)}</time>;
}
