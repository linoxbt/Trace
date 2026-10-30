// pnpm eval:verifier: the photo verifier eval (spec section 12), run locally.
//
// Judges every case in eval/verifier/set.ts with the production verifier and
// verdict rule, prints the scores and writes eval/results/verifier-<date>.json.
// The deployed site runs the same set on its own, one case a minute, and
// shows the results at /accuracy; this is for trying a change before it ships.
//
//   ANTHROPIC_API_KEY=... pnpm eval:verifier
//   pnpm eval:verifier --images-only     # just write the images to eval/verifier/images
//
// A run is 24 cases, one or two verifier calls each.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ClaudeVerifier, judgePair } from "@trace/engine";
import { summarizeVerifier } from "@trace/eval/summary";
import { CASES, caseImages, setVersion } from "@trace/eval/verifier";

const loadPhoto = async (name: string) => new Uint8Array(await readFile(`apps/web/public/photos/${name}.webp`));

async function main() {
  if (process.argv.includes("--images-only")) {
    await mkdir("eval/verifier/images", { recursive: true });
    for (const c of CASES) {
      const { before, after } = await caseImages(c, loadPhoto);
      await writeFile(`eval/verifier/images/${c.id}-before.jpg`, before);
      await writeFile(`eval/verifier/images/${c.id}-after.jpg`, after);
    }
    console.log(`Wrote ${CASES.length * 2} images to eval/verifier/images/.`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY to run the eval (or pass --images-only to just draw the set).");
    process.exit(1);
  }
  const verifier = new ClaudeVerifier({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.VERIFIER_MODEL });
  const results = [];
  for (const c of CASES) {
    try {
      const { before, after } = await caseImages(c, loadPhoto);
      const j = await judgePair(verifier, { id: c.id, title: c.title, acceptance: c.acceptance, before, after });
      results.push({ caseId: c.id, expected: c.expect, got: j.verdict, error: null, confidence: j.confidence, reason: j.observation.homeowner_reason });
      console.log(`${c.id} ${c.expect.padEnd(7)} ${j.verdict.padEnd(12)} ${j.confidence.toFixed(2)}  ${c.note}`);
    } catch (err) {
      results.push({ caseId: c.id, expected: c.expect, got: null, error: String(err) });
      console.log(`${c.id} error: ${String(err).slice(0, 120)}`);
    }
  }
  const summary = summarizeVerifier(results);
  console.log(`\nVerified ${summary.released}/${summary.releaseCases} finished; held ${summary.held}/${summary.holdCases} unfinished; wrongly released: ${summary.wronglyReleased.join(", ") || "none"}; errors: ${summary.errors}`);
  await mkdir("eval/results", { recursive: true });
  const out = `eval/results/verifier-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(out, JSON.stringify({ set: setVersion(), model: verifier.model, summary, results }, null, 2));
  console.log(`Wrote ${out}`);
}

await main();
