"use client";

import { useEffect, useState } from "react";

/** "UTC" for the server render and hydration, then the viewer's own zone (undefined: the browser's). */
export function useZone(): string | undefined {
  const [zone, setZone] = useState<string | undefined>("UTC");
  useEffect(() => setZone(undefined), []);
  return zone;
}
