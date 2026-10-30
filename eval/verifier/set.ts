// The photo verifier eval set (spec section 12). Each case is one line's
// acceptance, a before-photo and an after-photo, labelled with what should
// happen: "release" (the work is done, the line should verify) or "hold" (it
// isn't, and must not verify; failing it or sending it to the client both
// keep the money held).
//
// Two kinds of case:
// - real: the demo job's bathroom photos (apps/web/public/photos), in true
//   pairs and in pairs that must not pass (an unfinished wall, an unchanged
//   spot, the wrong spot);
// - drawn: simple scenes drawn in code, one per job type, so anyone can
//   rebuild them byte for byte. They test the judgement (is the stated
//   outcome visible?), not how the model copes with real light and blur.
//
// The eval scores the model's look and Trace's verdict rule together, as the
// proof flow runs them, with the location and capture checks taken as passed:
// those are code, tested elsewhere.

import sharp from "sharp";
import type { Acceptance } from "@trace/core";

export type Expect = "release" | "hold";

export interface VerifierCase {
  id: string;
  kind: "real" | "drawn";
  category: string;
  title: string;
  acceptance: Acceptance;
  before: Source;
  after: Source;
  expect: Expect;
  note: string;
}

/** A demo photo by file name, or a drawn scene. */
export type Source = { photo: string } | { scene: Scene };

const acc = (criterion: string, show: string[], notShow: string[]): Acceptance => ({
  criterion,
  must_show: show,
  must_not_show: notShow,
  framing: "Same angle as the before-photo",
});

// The demo job's lines (packages/engine/src/demo.ts).
const TAP = acc("The tap is closed and the spout is dry", ["tap closed with a dry spout"], ["water drops at the spout"]);
const SEAL = acc("A continuous sealant bead runs along the bath edge", ["continuous white sealant bead"], ["gaps or mould in the bead"]);
const RAIL = acc("The towel rail is level and fixed at both ends", ["rail level and fixed at both ends"], ["loose or missing bracket"]);
const GROUT = acc("Every joint on the wall is filled with grout", ["continuous grout in every joint"], ["visible cracks in the grout"]);

const real = (id: string, title: string, a: Acceptance, before: string, after: string, expect: Expect, note: string): VerifierCase => ({
  id,
  kind: "real",
  category: "home_repair",
  title,
  acceptance: a,
  before: { photo: before },
  after: { photo: after },
  expect,
  note,
});

export type Scene =
  | "crack" | "crack_fixed"
  | "hole" | "hole_patched" | "hole_patch_unpainted"
  | "lawn_long" | "lawn_mowed" | "lawn_half"
  | "room_messy" | "room_clear" | "room_part"
  | "wires" | "lamp"
  | "door_scratch" | "door_clean"
  | "hall_bare" | "hall_set";

const drawn = (id: string, category: string, title: string, a: Acceptance, before: Scene, after: Scene, expect: Expect, note: string): VerifierCase => ({
  id,
  kind: "drawn",
  category,
  title,
  acceptance: a,
  before: { scene: before },
  after: { scene: after },
  expect,
  note,
});

const WALL_TILE = acc("The cracked tile joint is filled and no crack is visible", ["the joint filled with grout along its length"], ["a dark crack line in the joint"]);
const PATCH = acc("The hole in the wall is filled and painted to match the wall", ["smooth wall where the hole was", "paint matching the rest of the wall"], ["an open hole", "a patch in a different colour"]);
const LAWN = acc("The whole lawn is mown short and even", ["short, even grass across the lawn"], ["areas of long grass"]);
const ROOM = acc("The floor is clear: every item has been picked up", ["an empty floor"], ["items left on the floor"]);
const LIGHT = acc("A ceiling light fitting is installed where the wires were", ["a light fitting fixed to the ceiling"], ["bare wires hanging from the ceiling"]);
const DOOR = acc("The scratch on the car door is gone", ["a clean, even door panel"], ["a visible scratch on the door"]);
const HALL = acc("Tables are set up in rows, each with a white cloth", ["rows of tables", "a white cloth on every table"], ["an empty hall"]);

export const CASES: VerifierCase[] = [
  // Real photos: the demo bathroom.
  real("r01", "Fix dripping tap", TAP, "l1-before", "l1-after", "release", "the demo's own pair"),
  real("r02", "Reseal bath edge", SEAL, "l2-before", "l2-after", "release", "the demo's own pair"),
  real("r03", "Refit towel rail", RAIL, "l3-before", "l3-after", "release", "the demo's own pair"),
  real("r04", "Regrout shower wall", GROUT, "l4-before", "l4-after", "release", "the demo's own pair"),
  real("r05", "Regrout shower wall", GROUT, "l4-before", "l4-unfinished", "hold", "grout only partly redone"),
  real("r06", "Reseal bath edge", SEAL, "l2-before", "l2-before", "hold", "nothing changed: the before-photo again"),
  real("r07", "Fix dripping tap", TAP, "l1-before", "l1-before", "hold", "nothing changed: still dripping"),
  real("r08", "Refit towel rail", RAIL, "l3-before", "l3-before", "hold", "nothing changed: rail still loose"),
  real("r09", "Fix dripping tap", TAP, "l1-before", "l2-after", "hold", "the wrong spot: a bath edge, not the tap"),
  real("r10", "Regrout shower wall", GROUT, "l4-before", "l3-after", "hold", "the wrong spot: a towel rail"),
  // Drawn scenes: one or more per job type.
  drawn("d01", "home_repair", "Fill cracked joint", WALL_TILE, "crack", "crack_fixed", "release", "crack gone"),
  drawn("d02", "home_repair", "Fill cracked joint", WALL_TILE, "crack", "crack", "hold", "crack still there"),
  drawn("d03", "home_repair", "Patch and paint hole", PATCH, "hole", "hole_patched", "release", "patched and painted"),
  drawn("d04", "home_repair", "Patch and paint hole", PATCH, "hole", "hole_patch_unpainted", "hold", "filled, not painted"),
  drawn("d05", "garden", "Mow the lawn", LAWN, "lawn_long", "lawn_mowed", "release", "all mown"),
  drawn("d06", "garden", "Mow the lawn", LAWN, "lawn_long", "lawn_half", "hold", "half mown"),
  drawn("d07", "cleaning", "Clear the floor", ROOM, "room_messy", "room_clear", "release", "floor clear"),
  drawn("d08", "cleaning", "Clear the floor", ROOM, "room_messy", "room_part", "hold", "two items left"),
  drawn("d09", "install", "Fit ceiling light", LIGHT, "wires", "lamp", "release", "light fitted"),
  drawn("d10", "install", "Fit ceiling light", LIGHT, "wires", "wires", "hold", "still bare wires"),
  drawn("d11", "car", "Remove door scratch", DOOR, "door_scratch", "door_clean", "release", "scratch gone"),
  drawn("d12", "car", "Remove door scratch", DOOR, "door_scratch", "door_scratch", "hold", "scratch still there"),
  drawn("d13", "events", "Set up tables", HALL, "hall_bare", "hall_set", "release", "tables set"),
  drawn("d14", "events", "Set up tables", HALL, "hall_bare", "hall_bare", "hold", "hall still empty"),
];

/** A stable name for this set: a new or changed case gives a new version, and a fresh run. */
export function setVersion(): string {
  let h = 2166136261;
  for (const ch of JSON.stringify(CASES)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `v1-${h.toString(16)}`;
}

// ---------- drawing ----------

const W = 1024;
const H = 768;

function tiles(): string {
  const t: string[] = [];
  for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) t.push(`<rect x="${x + 3}" y="${y + 3}" width="122" height="122" rx="3" fill="#eef0ee"/>`);
  // A soap shelf, so the two photos share a landmark.
  return `<rect width="${W}" height="${H}" fill="#b8bcb6"/>${t.join("")}<rect x="600" y="430" width="260" height="22" rx="6" fill="#9aa3a8"/><ellipse cx="690" cy="420" rx="40" ry="16" fill="#e8c9a0"/>`;
}

/** A painted wall with a socket and a skirting board: the landmarks for the patch cases. */
function wallWithSocket(extra: string): string {
  return `<rect width="${W}" height="${H}" fill="#e8dcc4"/><rect y="690" width="${W}" height="78" fill="#f7f3ea"/><rect x="800" y="560" width="90" height="90" rx="8" fill="#fafafa" stroke="#c9c2b3" stroke-width="3"/><rect x="825" y="590" width="12" height="26" fill="#555"/><rect x="853" y="590" width="12" height="26" fill="#555"/>${extra}`;
}

function grass(height: number, x0: number, x1: number, color: string): string {
  const blades: string[] = [];
  for (let x = x0; x < x1; x += 9) {
    for (let row = 0; row < 9; row++) {
      const y = 330 + row * 48 + ((x * 7) % 23);
      const lean = ((x * 13 + row * 5) % 11) - 5;
      blades.push(`<path d="M${x} ${y} l${lean} ${-height}" stroke="${color}" stroke-width="3"/>`);
    }
  }
  return blades.join("");
}

function lawn(kind: "long" | "mowed" | "half"): string {
  const sky = `<rect width="${W}" height="${H}" fill="#cfe6f5"/><rect y="300" width="${W}" height="${H - 300}" fill="#5f9e43"/><rect x="0" y="230" width="${W}" height="80" fill="#8a6b4a"/>`;
  const stripes = (x0: number, x1: number) => {
    const s: string[] = [];
    for (let x = x0; x < x1; x += 128) s.push(`<rect x="${x}" y="300" width="64" height="${H - 300}" fill="#6fb04f"/>`);
    return s.join("") + grass(6, x0, x1, "#4f8a36");
  };
  if (kind === "long") return sky + grass(46, 0, W, "#3f7a2a") + `<circle cx="300" cy="520" r="14" fill="#f2d03b"/><circle cx="760" cy="610" r="14" fill="#f2d03b"/>`;
  if (kind === "mowed") return sky + stripes(0, W);
  return sky + stripes(0, W / 2) + grass(46, W / 2, W, "#3f7a2a") + `<circle cx="760" cy="610" r="14" fill="#f2d03b"/>`;
}

function room(items: number): string {
  const base = `<rect width="${W}" height="${H}" fill="#e9e2d6"/><rect y="430" width="${W}" height="${H - 430}" fill="#b98d5f"/><rect x="80" y="120" width="220" height="260" fill="#f7f4ee" stroke="#9c8f7c" stroke-width="6"/><rect x="700" y="250" width="240" height="180" rx="12" fill="#6b7d8c"/>`;
  const all = [
    `<rect x="160" y="560" width="120" height="40" rx="8" fill="#c0392b" transform="rotate(-10 220 580)"/>`,
    `<circle cx="470" cy="610" r="34" fill="#2980b9"/>`,
    `<rect x="600" y="640" width="150" height="26" fill="#f1c40f" transform="rotate(14 675 653)"/>`,
    `<path d="M300 690 q40 -40 80 0 q40 40 80 0" stroke="#8e44ad" stroke-width="16" fill="none"/>`,
    `<rect x="820" y="560" width="90" height="70" fill="#7f8c8d"/>`,
  ];
  return base + all.slice(0, items).join("");
}

function ceiling(kind: "wires" | "lamp"): string {
  const base = `<rect width="${W}" height="${H}" fill="#f3f1ec"/><rect width="${W}" height="200" fill="#fbfaf7"/><line x1="0" y1="200" x2="${W}" y2="200" stroke="#ddd8cc" stroke-width="4"/><circle cx="512" cy="40" r="26" fill="#e6e2d8"/>`;
  if (kind === "wires")
    return base + `<path d="M500 40 q-20 90 -40 150" stroke="#c0392b" stroke-width="7" fill="none"/><path d="M512 40 q5 100 0 170" stroke="#2c3e50" stroke-width="7" fill="none"/><path d="M524 40 q25 80 45 140" stroke="#27ae60" stroke-width="7" fill="none"/>`;
  return base + `<line x1="512" y1="40" x2="512" y2="250" stroke="#333" stroke-width="5"/><path d="M412 330 L470 250 L554 250 L612 330 Z" fill="#2c3e50"/><ellipse cx="512" cy="340" rx="34" ry="18" fill="#fff6c9"/>`;
}

function door(scratch: boolean): string {
  const base = `<rect width="${W}" height="${H}" fill="#d5d8dc"/><rect x="60" y="90" width="900" height="560" rx="40" fill="#1f4e79"/><rect x="120" y="130" width="780" height="200" rx="24" fill="#a9c6de" opacity="0.8"/><rect x="700" y="400" width="140" height="28" rx="14" fill="#c0c7ce"/><line x1="60" y1="470" x2="960" y2="470" stroke="#183c5d" stroke-width="5"/>`;
  return scratch ? base + `<path d="M220 520 l120 -18 l110 22 l140 -26 l90 14" stroke="#e8edf2" stroke-width="6" fill="none"/>` : base;
}

function hall(set: boolean): string {
  const base = `<rect width="${W}" height="${H}" fill="#efe7da"/><rect y="380" width="${W}" height="${H - 380}" fill="#c8b8a0"/><rect x="420" y="80" width="180" height="300" fill="#d9cdb8" stroke="#a89878" stroke-width="5"/>`;
  if (!set) return base;
  const t: string[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      const x = 90 + c * 230 + r * 20;
      const y = 430 + r * 110;
      t.push(`<rect x="${x}" y="${y}" width="170" height="60" rx="6" fill="#ffffff" stroke="#d0d0d0" stroke-width="2"/><rect x="${x + 10}" y="${y + 60}" width="8" height="34" fill="#6b5a45"/><rect x="${x + 152}" y="${y + 60}" width="8" height="34" fill="#6b5a45"/>`);
    }
  return base + t.join("");
}

function scene(s: Scene): string {
  switch (s) {
    case "crack":
      return tiles() + `<path d="M387 0 l0 60 l-4 30 l6 40 l-5 50 l4 60" stroke="#3b3b3b" stroke-width="5" fill="none"/>`;
    case "crack_fixed":
      return tiles() + `<rect x="384" y="0" width="6" height="250" fill="#c9ccc7"/>`;
    case "hole":
      return wallWithSocket(`<ellipse cx="520" cy="360" rx="70" ry="52" fill="#3a3027"/><ellipse cx="520" cy="360" rx="84" ry="64" fill="none" stroke="#c9b99b" stroke-width="10"/>`);
    case "hole_patched":
      return wallWithSocket("");
    case "hole_patch_unpainted":
      return wallWithSocket(`<rect x="420" y="280" width="200" height="160" rx="10" fill="#fbfbf9"/>`);
    case "lawn_long":
      return lawn("long");
    case "lawn_mowed":
      return lawn("mowed");
    case "lawn_half":
      return lawn("half");
    case "room_messy":
      return room(5);
    case "room_clear":
      return room(0);
    case "room_part":
      return room(2);
    case "wires":
      return ceiling("wires");
    case "lamp":
      return ceiling("lamp");
    case "door_scratch":
      return door(true);
    case "door_clean":
      return door(false);
    case "hall_bare":
      return hall(false);
    case "hall_set":
      return hall(true);
  }
}

/** A drawn scene as a JPEG, as the app would store it. */
export async function drawScene(s: Scene): Promise<Buffer> {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${scene(s)}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/** Any photo as a JPEG no wider than the app's (the demo photos are WebP). */
export async function toJpeg(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

/**
 * The case's two images as JPEGs. Demo photos come from `loadPhoto` (the
 * script reads apps/web/public/photos; the server fetches them from the site).
 */
export async function caseImages(c: VerifierCase, loadPhoto: (name: string) => Promise<Uint8Array>): Promise<{ before: Buffer; after: Buffer }> {
  const one = async (s: Source) => ("photo" in s ? toJpeg(await loadPhoto(s.photo)) : drawScene(s.scene));
  const [before, after] = await Promise.all([one(c.before), one(c.after)]);
  return { before, after };
}
