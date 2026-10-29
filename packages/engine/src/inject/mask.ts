// Stage B (Tripwire section 7): paint over every text region so the
// re-judge sees the work without the words. The original is never changed;
// the masked copy is stored beside it for the homeowner and the evidence pack.

import sharp from "sharp";
import type { TextScan } from "@trace/core";

/** Padding around each region, as a share of the region's own size. */
export const MASK_PADDING = 0.08;

export async function maskText(image: Uint8Array, texts: TextScan["texts"]): Promise<Buffer> {
  const img = sharp(image);
  const { width = 0, height = 0 } = await img.metadata();
  const boxes = texts
    .map(({ box }) => {
      // At least 1% of the photo on each side, so thin regions are fully covered.
      const px = Math.max(MASK_PADDING * box.w, 0.01);
      const py = Math.max(MASK_PADDING * box.h, 0.01);
      const left = Math.max(0, Math.floor((box.x - px) * width));
      const top = Math.max(0, Math.floor((box.y - py) * height));
      const right = Math.min(width, Math.ceil((box.x + box.w + px) * width));
      const bottom = Math.min(height, Math.ceil((box.y + box.h + py) * height));
      return { left, top, w: right - left, h: bottom - top };
    })
    .filter((b) => b.w > 0 && b.h > 0);
  return img
    .composite(boxes.map((b) => ({ input: { create: { width: b.w, height: b.h, channels: 3 as const, background: { r: 128, g: 128, b: 128 } } }, left: b.left, top: b.top })))
    .jpeg({ quality: 85 })
    .toBuffer();
}
