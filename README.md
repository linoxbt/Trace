# Trace

**Payment that follows proof.** Trace turns a home-repair job into a contract a camera can check. The homeowner's PayPal payment is authorized, not charged. Money is captured line by line, and only for work an AI has verified from photos.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). MIT licensed.

## Status

This repository holds the backend core. The Next.js app, the Claude scope writer and verifier, the dispute evidence pack and judge mode's demo seeding come next.

| Part | State |
| --- | --- |
| Capture math, state machines, verdict policy, integrity checks (`packages/core`) | Built, unit tested |
| PayPal REST client: Orders v2, Payments v2, Disputes, webhook verification (`packages/paypal`) | Built, tested against recorded responses; not yet run against the sandbox |
| Postgres schema with row-level security, migrations, queries (`packages/db`) | Built, tested on Postgres 16 |
| Capture engine: authorize, prove, review window, partial and final capture, close, void, reauthorize, webhooks (`packages/engine`) | Built, tested end to end against a fake PayPal |
| Background worker (`apps/worker`) | Built |
| Web app, Claude verifier, evidence PDF, judge-mode seeding | Not started |

The PayPal client is written by hand. The spec plans to generate it with the APIMatic Context Plugin for the sponsor prize; that has not been done yet.

## How the money moves

1. The homeowner approves a PayPal order with `intent: AUTHORIZE`. Trace authorizes it on the server and checks the authorized amount against the frozen scope.
2. For each line, the tradesperson opens the in-app camera, which issues a one-time token valid for 120 seconds. The after-photo goes through the integrity checks (token, 150 m geofence, device, dHash against the before-photo and every stored photo). Then the vision verifier returns observations, and code turns them into Verified, Needs review or Failed.
3. The homeowner approves or flags each proved line. Silence approves a Verified line once its review window lapses; a Needs review line never auto-releases.
4. A release captures exactly the approved lines, with `final_capture: false` until no other line is open. Amounts are recomputed from line states in a locked transaction, and never exceed the authorization.
5. A capture is recorded with its `PayPal-Request-Id` before it is sent. A lost response is retried with the same ID, so it can't become a second capture. If PayPal refuses, the lines go back to releasable and the timeline says nothing was charged.
6. Closing needs both sides to agree which lines to drop. What is approved goes in a final capture; otherwise the remainder is voided.
7. After the 3-day honor period, the worker reauthorizes once while lines are still open. A refusal is recorded and flagged for both sides, not retried.
8. Webhooks are verified with PayPal against the raw body, de-duplicated on event ID, and reconcile captures, voids and disputes.

## Layout

```
packages/core      pure domain: money, state machines, capture planning, verdict policy, integrity, schemas
packages/paypal    PayPal REST client, plus FakePayPal (same rules, in memory) for tests
packages/db        migrations/001_init.sql, migration runner, typed queries
packages/engine    the flows: jobs, proof, money, webhooks; photo normalisation and dHash (sharp)
apps/worker        30-second loop: auto-release, capture retries, reauthorization; /healthz
scripts            paypal-spike.ts, the day-1 sandbox test
```

## Run it

Needs Node 22, pnpm 10 and Postgres 15+ (Supabase in production).

```sh
pnpm install
cp .env.example .env                 # fill in DATABASE_URL and the PayPal sandbox keys
pnpm db:migrate                      # create the tables
pnpm spike:paypal                    # day 1: authorize, partial capture, final capture, void, reauthorize
pnpm worker                          # the background worker, health at :8080/healthz
```

## Tests

```sh
pnpm typecheck
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

## Known limits

- One authorization per job. Change orders (their own order and authorization) aren't built yet.
- PayPal seller protection targets goods, so a services dispute isn't guaranteed to go the tradesperson's way. The evidence pack is the best possible defence, not a guaranteed win.
- The multipart field name for dispute evidence (`file1`) still needs confirming against the sandbox.
