// Server-side proof checks from spec section 7. Pure: the caller supplies the
// hashes, positions and token facts; this decides what they mean.

export const GEOFENCE_M = 150;
export const GPS_ACCURACY_REVIEW_M = 100;
export const SAME_IMAGE_HAMMING = 6;
export const CAPTURE_TOKEN_TTL_S = 120;

export type CheckResult = "pass" | "review" | "fail" | "skipped";

export interface IntegrityCheck {
  name: "capture_token" | "geofence" | "no_change" | "reuse" | "device";
  result: CheckResult;
  detail: string;
}

export interface IntegrityReport {
  status: "pass" | "review" | "fail";
  checks: IntegrityCheck[];
  distanceM: number | null;
  beforeHamming: number;
  reuseHamming: number | null;
  /** A judge-mode sample photo: camera, geofence, token and device checks were not run. */
  sample: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface IntegrityInput {
  sample: boolean;
  tokenValid: boolean;
  gps: (LatLng & { accuracyM: number }) | null;
  anchor: LatLng | null;
  dhash: string;
  beforeDhash: string;
  /** Smallest Hamming distance to any other photo stored in Trace, or null if there are none. */
  nearestOtherHamming: number | null;
  sameDevice: boolean;
  /**
   * Largest per-cell pixel difference from the before-photo (0 to 255), when
   * the dHashes are close. A same-angle photo of a small fix hashes close to
   * its before-photo; only a near-identical one (a re-saved copy) is "no change".
   */
  beforeCellDiff?: number | null;
}

/** At or under this cell difference, a close dHash really is the same photo. */
export const SAME_IMAGE_CELL_DIFF = 4;

/** Hamming distance between two 64-bit dHashes written as 16 hex characters. */
export function hamming(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) throw new RangeError("dHash must be 16 lowercase hex characters");
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function tokenFresh(issuedAt: Date, now: Date): boolean {
  const age = (now.getTime() - issuedAt.getTime()) / 1000;
  return age >= 0 && age <= CAPTURE_TOKEN_TTL_S;
}

export function evaluateIntegrity(input: IntegrityInput): IntegrityReport {
  const checks: IntegrityCheck[] = [];
  let distanceM: number | null = null;

  if (input.sample) {
    for (const name of ["capture_token", "geofence", "device"] as const) {
      checks.push({ name, result: "skipped", detail: "sample photo in judge mode" });
    }
  } else {
    checks.push(
      input.tokenValid
        ? { name: "capture_token", result: "pass", detail: "one-time token used within 120 s" }
        : { name: "capture_token", result: "fail", detail: "missing, used or expired capture token" },
    );
    if (!input.gps || !input.anchor) {
      checks.push({ name: "geofence", result: "review", detail: input.anchor ? "no location at capture" : "job has no location anchor" });
    } else {
      distanceM = Math.round(haversineM(input.gps, input.anchor));
      if (distanceM > GEOFENCE_M) {
        checks.push({ name: "geofence", result: "fail", detail: `${distanceM} m from the job, limit ${GEOFENCE_M} m` });
      } else if (input.gps.accuracyM > GPS_ACCURACY_REVIEW_M) {
        checks.push({ name: "geofence", result: "review", detail: `GPS accuracy ${Math.round(input.gps.accuracyM)} m is worse than ${GPS_ACCURACY_REVIEW_M} m` });
      } else {
        checks.push({ name: "geofence", result: "pass", detail: `${distanceM} m from the job` });
      }
    }
    checks.push(
      input.sameDevice
        ? { name: "device", result: "pass", detail: "same signed-in device that started the job" }
        : { name: "device", result: "review", detail: "a different device from the one that started the job" },
    );
  }

  const beforeHamming = hamming(input.dhash, input.beforeDhash);
  const cell = input.beforeCellDiff ?? null;
  const sameAsBefore = beforeHamming <= SAME_IMAGE_HAMMING && (cell === null || cell <= SAME_IMAGE_CELL_DIFF);
  checks.push(
    sameAsBefore
      ? { name: "no_change", result: "fail", detail: "after-photo matches before-photo" }
      : {
          name: "no_change",
          result: "pass",
          detail:
            beforeHamming <= SAME_IMAGE_HAMMING
              ? `same framing as the before-photo, but the picture changed (cell difference ${cell})`
              : `differs from the before-photo (distance ${beforeHamming})`,
        },
  );

  const reuseHamming = input.nearestOtherHamming;
  checks.push(
    reuseHamming !== null && reuseHamming <= SAME_IMAGE_HAMMING
      ? { name: "reuse", result: "fail", detail: "photo already used" }
      : { name: "reuse", result: "pass", detail: reuseHamming === null ? "no other photos to compare" : `nearest other photo at distance ${reuseHamming}` },
  );

  const status = checks.some((c) => c.result === "fail") ? "fail" : checks.some((c) => c.result === "review") ? "review" : "pass";
  return { status, checks, distanceM, beforeHamming, reuseHamming, sample: input.sample };
}
