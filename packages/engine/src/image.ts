// Photo normalisation and the perceptual hash (spec section 7).

import sharp from "sharp";
import type { Region } from "@trace/core";

export const LONG_EDGE = 1568;

/** Rotate by EXIF, strip metadata, fit inside 1568 px, re-encode as JPEG. */
export async function normalizePhoto(input: Uint8Array): Promise<Buffer> {
  return sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

/**
 * dHash: shrink to 9x8 grey, and set one bit per pixel that is brighter than
 * its right-hand neighbour. 64 bits, written as 16 hex characters.
 */
export async function dHash(input: Uint8Array): Promise<string> {
  const px = await sharp(input).greyscale().resize(9, 8, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (px[y * 9 + x]! > px[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

/** The region the model pointed at, padded and enlarged 2x, for the second pass. */
export async function cropRegion(input: Uint8Array, region: Region): Promise<Buffer> {
  const img = sharp(input);
  const { width = 0, height = 0 } = await img.metadata();
  const pad = 0.1;
  const x0 = Math.max(0, region.x - pad * region.w);
  const y0 = Math.max(0, region.y - pad * region.h);
  const x1 = Math.min(1, region.x + region.w * (1 + pad));
  const y1 = Math.min(1, region.y + region.h * (1 + pad));
  const left = Math.floor(x0 * width);
  const top = Math.floor(y0 * height);
  const w = Math.max(16, Math.min(width - left, Math.ceil((x1 - x0) * width)));
  const h = Math.max(16, Math.min(height - top, Math.ceil((y1 - y0) * height)));
  return sharp(input)
    .extract({ left, top, width: w, height: h })
    .resize({ width: Math.min(LONG_EDGE, w * 2), height: Math.min(LONG_EDGE, h * 2), fit: "inside" })
    .jpeg({ quality: 90 })
    .toBuffer();
}
