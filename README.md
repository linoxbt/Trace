# Trace

**Payment that follows proof.** Trace turns a home-repair job into a contract a camera can check. The homeowner's PayPal payment is authorized, not charged. Money is captured line by line, and only for work an AI has verified from photos.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). MIT licensed.

## Status

This repository holds the backend, the Next.js app and Tripwire, the guard in front of every money move. The dispute evidence pack and judge mode's demo seeding come next.

| Part | State |
| --- | --- |
| Capture math, state machines, verdict policy, integrity checks (`packages/core`) | Built, unit tested |
| PayPal REST client: Orders v2, Payments v2, Disputes, webhook verification (`packages/paypal`) | Built, tested against recorded responses; not yet run against the sandbox |
| Postgres schema with row-level security, migrations, queries (`packages/db`) | Built, tested on Postgres 16 |
| Capture engine: authorize, prove, review window, partial and final capture, close, void, reauthorize, webhooks (`packages/engine`) | Built, tested end to end against a fake PayPal |
| Background worker (`apps/worker`) | Built |
| Next.js app (`apps/web`): API routes for every flow, PayPal webhook, magic-link sign-in, job list, new job, job page with money bar, scope editor, in-app camera, PayPal v6 hold button, approve/flag/release, close | Built; builds and serves locally; not yet run against Supabase and the sandbox |
| Sandbox end-to-end test (`scripts/sandbox-e2e.ts`) | Ready; needs sandbox keys to run |
| Claude photo verifier (`packages/engine/src/claude-verifier.ts`) | Built; runs when `ANTHROPIC_API_KEY` is set |
| Tripwire: guard, rules, ledger, approvals, injection defence, rule compiler (see [Safety](#safety-tripwire)) | Built, tested against a fake PayPal and scripted models |
| Evidence PDF, judge-mode seeding, Realtime | Not started |

The PayPal client is written by hand. The spec plans to generate it with the APIMatic Context Plugin for the sponsor prize; that has not been done yet.

## Brand

The mark is two bars on a violet squircle: a solid one for money released, an outlined one for money still held. Logo files, colours and type are in [`brand/`](brand/README.md).

## How the money moves

1. The homeowner approves a PayPal order with `intent: AUTHORIZE`. Trace authorizes it on the server and checks the authorized amount against the frozen scope.
2. For each line, the tradesperson opens the in-app camera, which issues a one-time token valid for 120 seconds. The after-photo goes through the integrity checks (token, 150 m geofence, device, dHash against the before-photo and every stored photo). Then the vision verifier returns observations, and code turns them into Verified, Needs review or Failed.
3. The homeowner approves or flags each proved line. Silence approves a Verified line once its review window lapses; a Needs review line never auto-releases.
4. A release captures exactly the approved lines, with `final_capture: false` until no other line is open. Amounts are recomputed from line states in a locked transaction, and never exceed the authorization.
5. A capture is recorded with its `PayPal-Request-Id` before it is sent. A lost response is retried with the same ID, so it can't become a second capture. If PayPal refuses, the lines go back to releasable and the timeline says nothing was charged.
6. Closing needs both sides to agree which lines to drop. What is approved goes in a final capture; otherwise the remainder is voided.
7. After the 3-day honor period, the worker reauthorizes once while lines are still open. A refusal is recorded and flagged for both sides, not retried.
8. Webhooks are verified with PayPal against the raw body, de-duplicated on event ID, and reconcile captures, voids and disputes.

## Safety: Tripwire

AI reads the photos; it never moves the money. Every capture, void, reauthorization, refund and dispute filing goes through one function, `packages/engine/src/guard/execute.ts`, in the same five steps:

1. **Check the action.** The amount is recomputed from the stored lines, never taken from a request or a model.
2. **Read live facts.** The hold's status comes from PayPal, and disputes are listed at PayPal too, not just when a webhook arrives. If PayPal can't be read, the answer is deny: nothing moves.
3. **Trace the inputs.** Every input is labelled with how far it can be trusted. Photos and anything a model read from them are never trusted as instructions.
4. **Apply the rules.** The eleven built-in rules (B1 to B11) come first, then the presets and people's own rules. Deny beats ask-first, and ask-first beats allow.
5. **Write the decision down, then act.** The decision goes to `guard_decisions`, which a database trigger keeps append-only. Only then is PayPal asked.

Only `execute.ts` can import the money client (`guard/paypal-money.ts`), and a test fails if any other file calls a money-moving PayPal method.

- **Approvals.** When a rule asks first, an approval request is opened. It expires after 24 hours, or 5 minutes in demo mode. Approving re-runs the guard on the same frozen action with the approval attached, so the built-in deny rules still apply. "Both" needs one tap from each side.
- **Presets.** Three presets are on by default:
  - Releases over $150 need the homeowner's tap.
  - More than $300 released in 24 hours needs a tap.
  - More than 3 releases in 10 minutes need a tap.

  A release the homeowner started themselves doesn't need the first two.
- **Your own rules.** People write rules in plain English.
  - Claude Sonnet 5.5 compiles them to rule JSON using only the fields the guard checks. It says "unsupported" rather than guessing when a rule can't be expressed.
  - Claude Haiku 5.5 reads the JSON back without seeing the person's words.
  - A backtest replays the person's past decisions with the new rule and reports how many it would have changed.
  - Rules can only ask first or block; nothing a person writes can loosen a built-in rule.
- **Planted notes.** Text in a proof photo can't steer a verdict:
  1. Claude Haiku 5.5 lists the text in every proof photo and before-photo, beside the verifier's first look.
  2. If a Verified proof has any text, the text is painted out on a stored copy (`sharp`, 8% padding) and the line is judged again on the masked pair.
  3. If the verdict changes, or the text was aimed at the inspector, the line goes to Needs review. The homeowner sees the note outlined beside the masked copy.

  A scan that fails is never read as "no text". When a scope is sent, its lines are checked the same way for instructions aimed at the AI.
- **Agents.** AI agents can draft (rule B6), but they never trigger a money move.

`pnpm eval:inject` measures the planted-note check. It draws 20 planted notes (including Yoruba, Pidgin and Spanish ones, faint text and notes cut off at the frame) and 10 ordinary labels. It then runs the real scanner and prints the confusion matrix. The targets are at least 95% caught, at most 10% false flags, and no planted note with no text found. The set is synthetic, and the eval needs `ANTHROPIC_API_KEY`. **It has not been run yet**, so there is no catch rate to report.

What's left out of the add-on spec: rule B12 (a price over 3x the AI's suggestion), because Trace doesn't suggest prices. Refunds and dispute evidence go through the guard but have no buttons in the app yet.

## Layout

```
packages/core      pure domain: money, state machines, capture planning, verdict policy, integrity, schemas
packages/paypal    PayPal REST client, plus FakePayPal (same rules, in memory) for tests
packages/db        migrations/001_init.sql, migration runner, typed queries
packages/engine    the flows: jobs, proof, money, webhooks; photo normalisation and dHash (sharp)
apps/web           Next.js 15 app: API routes, PayPal webhook, pages and components
apps/worker        30-second loop: auto-release, capture retries, reauthorization; /healthz
scripts            sandbox-e2e.ts: Trace's engine against the real PayPal sandbox; eval-inject.ts: the planted-note eval
eval/inject        the injection eval set, drawn in code
```

## Run it

Needs Node 22, pnpm 10 and Postgres 15+ (Supabase in production).

```sh
pnpm install
cp .env.example .env                 # fill in DATABASE_URL and the PayPal sandbox keys
pnpm db:migrate                      # create the tables
pnpm sandbox:e2e                     # Trace against the PayPal sandbox (needs TEST_DATABASE_URL too)
pnpm web                             # the app at http://localhost:3000
pnpm worker                          # the background worker, health at :8080/healthz
```

## Sandbox test

`pnpm sandbox:e2e` runs Trace's engine with the real PayPal client against the sandbox. It covers:

- The $310 partial capture and the $110 final capture.
- A close that voids the rest.
- A capture resent with its stored request ID, which must return the same capture.
- Reauthorizing a partially captured authorization.
- Captures refused after void and over the hold.

With `PAYPAL_SANDBOX_BUYER_EMAIL` and `PAYPAL_SANDBOX_BUYER_PASSWORD` set, headless Chromium approves each order as the sandbox buyer (run `npx playwright install chromium` once). Without them, it prints the approval link and waits. Results are written to `scripts/evidence/`. Photos are synthetic and the verifier is scripted, so this tests the money, not the vision model.

## Tests

```sh
pnpm typecheck                       # packages, worker and web app
pnpm build:web
TEST_DATABASE_URL=postgres://postgres@localhost:5432/trace_test pnpm test
```

Without `TEST_DATABASE_URL`, the database and engine tests are skipped and the pure tests still run. The test database's `public` schema is dropped on every run. CI runs everything against Postgres 16.

The engine tests drive the demo bathroom job ($420 across four lines) through the whole flow. They cover:

- $310 released while $110 stays held, then the redone grout released as the final capture.
- Review windows and auto-approval.
- Flagging, and the two people's permissions.
- A lost capture response, retried without a second capture.
- Two concurrent releases.
- A refused capture.
- Closing with a dropped line, the void, and cancellation.
- Reauthorization, accepted and refused.
- Geofence, reuse and no-change failures, token expiry, and the second pass on a crop.
- Judge-mode sample photos.
- Webhook verification, de-duplication, denied captures and disputes.

The Tripwire tests cover:

- Every built-in rule, firing and not firing.
- The money-client boundary.
- The ledger row written before PayPal is called.
- A dispute opened at PayPal before its webhook arrives.
- PayPal unreachable, which means deny.
- Agents refused.
- A reused request id.
- A capture no decision allowed.
- The $150 preset asking, then capturing on the homeowner's tap.
- Approvals that can't bypass the built-ins.
- "Both" needing two taps, and expiry.
- Planted notes in after-photos and before-photos, and text that steered the verdict.
- Brand marks let through, and failed scans.
- Scope flags.
- Rule compile, readback, backtest and saving, and that rules only tighten.

## Deploy on Netlify

`netlify.toml` builds `apps/web` with Netlify's Next.js runtime. Middleware becomes an Edge Function and the API routes become Functions. The worker's periodic jobs run as a scheduled function, `apps/web/netlify/tick.mts` (bundled into `netlify/functions/tick.mjs` at build time, schedule in `netlify.toml`), once a minute: Netlify has no always-on processes, and a minute is its finest schedule. The build runs the database migrations whenever `DATABASE_URL` is available to it.

Set these in Netlify under **Site configuration > Environment variables**, then trigger a new deploy, because values are fixed at build time:

| Variable | Scopes |
| --- | --- |
| `DATABASE_URL` | Builds, Functions |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Builds, Functions |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `ANTHROPIC_API_KEY` | Functions (mark as secret) |
| `APP_URL`, `PAYPAL_API_BASE`, `DEMO_MODE` | Builds, Functions |

`render.yaml` and `apps/worker` remain for hosting on Render instead.

## Known limits

- One authorization per job. Change orders (their own order and authorization) aren't built yet.
- PayPal seller protection targets goods, so a services dispute isn't guaranteed to go the tradesperson's way. The evidence pack is the best possible defence, not a guaranteed win.
- The multipart field name for dispute evidence (`file1`) still needs confirming against the sandbox.
