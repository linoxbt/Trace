// Judge mode's sample proof: photos of each demo line's spot, served from
// /public/photos. They still go through the verifier and the hash checks.

export interface Sample {
  label: string;
  src: string;
}

export const DEMO_SAMPLES: Record<string, Sample[]> = {
  L1: [{ label: "Tap fixed", src: "/photos/l1-after.webp" }],
  L2: [{ label: "Bath resealed", src: "/photos/l2-after.webp" }],
  L3: [{ label: "Rail refitted", src: "/photos/l3-after.webp" }],
  L4: [
    { label: "Grout not finished", src: "/photos/l4-unfinished.webp" },
    { label: "Grout redone", src: "/photos/l4-after.webp" },
  ],
};
