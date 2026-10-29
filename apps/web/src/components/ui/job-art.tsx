// Photos of the demo job's four lines, before and after: a dripping tap, a
// bath edge's sealant, a towel rail and the shower wall's grout. Each pair is
// shot from the same spot, as Trace asks for. They are generated stand-ins
// (public/photos/README.md) until the real job is photographed.

type State = "before" | "after";
export type JobCode = "L1" | "L2" | "L3" | "L4";

const ALT: Record<JobCode, Record<State, string>> = {
  L1: { before: "A chrome basin tap dripping, with limescale in the sink", after: "The same tap repaired, spout and sink dry" },
  L2: { before: "Peeling, mouldy sealant along a bath edge", after: "A fresh, continuous white sealant bead along the same bath edge" },
  L3: { before: "A towel rail pulled away from the wall at one end", after: "The same towel rail refitted level, both brackets fixed" },
  L4: { before: "Crumbling shower grout with a crack above the soap dish", after: "The same shower wall freshly regrouted, no cracks" },
};

/** Where to keep the subject in frame when a photo is cropped to a wider card. */
const FOCUS: Record<JobCode, string> = { L1: "50% 50%", L2: "50% 55%", L3: "50% 45%", L4: "50% 48%" };

export function JobPhoto({ code, state, className = "", highlight = false }: { code: JobCode; state: State; className?: string; highlight?: boolean }) {
  const src = `/photos/${code.toLowerCase()}-${state}.webp`;
  if (!highlight)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={ALT[code][state]} loading="lazy" decoding="async" draggable={false} className={`object-cover ${className}`} style={{ objectPosition: FOCUS[code] }} />
    );
  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={ALT[code][state]} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: FOCUS[code] }} />
      {/* The crack the check found, above the soap dish. */}
      <span className="absolute left-[44%] top-[34%] h-[17%] w-[34%] rounded-md border-2 border-dashed border-bad bg-bad/10" aria-label="The crack the check found" />
    </span>
  );
}

type ArtProps = { state: State; className?: string };

export function TapArt(p: ArtProps) {
  return <JobPhoto code="L1" {...p} />;
}

export function SealArt(p: ArtProps) {
  return <JobPhoto code="L2" {...p} />;
}

export function RailArt(p: ArtProps) {
  return <JobPhoto code="L3" {...p} />;
}

export function GroutArt(p: ArtProps & { highlight?: boolean }) {
  return <JobPhoto code="L4" {...p} />;
}

export const ART = { L1: TapArt, L2: SealArt, L3: RailArt, L4: GroutArt } as const;
