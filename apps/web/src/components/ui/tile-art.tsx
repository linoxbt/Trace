// The shower wall (line L4), before and after regrouting.

import { JobPhoto } from "./job-art";

export function TileArt({ state, className = "", highlight = false }: { state: "before" | "after"; className?: string; highlight?: boolean }) {
  return <JobPhoto code="L4" state={state} className={className} highlight={highlight} />;
}
