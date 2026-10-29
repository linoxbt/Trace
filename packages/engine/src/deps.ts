import type { Db } from "@trace/db";
import type { PayPalApi } from "@trace/paypal";
import type { PhotoStorage } from "./storage.ts";
import type { TextScanner } from "./inject/text-scan.ts";
import type { RuleCompiler } from "./rules/compile.ts";
import type { DisputeDrafter } from "./disputes.ts";
import type { ScopeDrafter } from "./scope-draft.ts";
import type { Verifier } from "./verifier.ts";

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export interface EngineSettings {
  /** PayPal webhook ID from the developer dashboard; webhooks are verified against it. */
  webhookId: string;
  /** Demo mode (section 12): 60 s review windows and the sandbox require-evidence route. */
  demoMode: boolean;
  /** Verified needs at least this confidence (0.80, or 0.85 as the section 16 fallback). */
  confidenceThreshold: number;
  brandName: string;
}

export interface Engine {
  db: Db;
  paypal: PayPalApi;
  storage: PhotoStorage;
  verifier: Verifier;
  /** Finds text in proof photos (Tripwire section 7). Without one, a proof can't end Verified on its own. */
  scanner?: TextScanner;
  /** Plain-English payment rules to rule JSON, and the blind readback. */
  compiler?: RuleCompiler;
  /** The dispute assistant (section 6.3). Without one, the response starts from a fixed template. */
  drafter?: DisputeDrafter;
  /** Scope generation from before-photos and a description (section 6.1). */
  scopeDrafter?: ScopeDrafter;
  settings: EngineSettings;
  now: () => Date;
  log: Logger;
}

export const DEMO_REVIEW_WINDOW_S = 60;
export const HONOR_PERIOD_DAYS = 3;

export const consoleLogger: Logger = {
  info: (msg, data) => console.log(JSON.stringify({ level: "info", msg, ...data })),
  warn: (msg, data) => console.warn(JSON.stringify({ level: "warn", msg, ...data })),
  error: (msg, data) => console.error(JSON.stringify({ level: "error", msg, ...data })),
};
