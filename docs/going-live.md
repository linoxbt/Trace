# Going live with real money

Trace runs on PayPal's sandbox. This is the checklist for switching it to live
PayPal. Most of it is PayPal's own approval and settings. The code already
behaves for live: demo jobs and demo mode only work on the sandbox, and the
"no real money" notices go away once `NEXT_PUBLIC_PAYPAL_ENV=live` is set.

## 1. PayPal approval (only PayPal can do this)

- **Partner onboarding.** Trace pays each tradesperson straight into their own
  PayPal account. To do that it signs them up through PayPal's Partner
  Referrals API and names them as the payee on each order. PayPal must approve
  a live partner integration before those calls work outside the sandbox.
  Apply through PayPal's partner programme or your PayPal contact. Tell them
  the integration uses:
  - Orders v2 with `intent: AUTHORIZE`, partial captures and `final_capture`;
  - reauthorization;
  - voids and refunds;
  - disputes (reading them and providing evidence);
  - webhooks.
- **BN code.** PayPal issues a partner attribution ID with approval. It goes in
  `PAYPAL_BN_CODE`.
- **Business account.** The live partner account must be a verified business
  account. Its merchant ID goes in `PAYPAL_PARTNER_MERCHANT_ID`.

## 2. Live app and webhook (PayPal developer dashboard, Live tab)

1. Create a live REST app. Copy its client ID and secret.
2. Add a webhook to `https://<your-domain>/api/webhooks/paypal` with these
   events:
   - `CHECKOUT.ORDER.APPROVED`
   - `PAYMENT.AUTHORIZATION.CREATED`
   - `PAYMENT.AUTHORIZATION.VOIDED`
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.PENDING`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.DECLINED`
   - `PAYMENT.CAPTURE.REFUNDED`
   - `CUSTOMER.DISPUTE.CREATED`
   - `CUSTOMER.DISPUTE.UPDATED`
   - `CUSTOMER.DISPUTE.RESOLVED`
   - `MERCHANT.ONBOARDING.COMPLETED`
   - `MERCHANT.PARTNER-CONSENT.REVOKED`
   - `CUSTOMER.MERCHANT-INTEGRATION.SELLER-EMAIL-CONFIRMED`
   - `CUSTOMER.MERCHANT-INTEGRATION.CAPABILITY-UPDATED`
3. Copy the webhook's ID.

## 3. Netlify environment

Set these, then redeploy. Mark secrets as secret.

| Variable | Live value |
| --- | --- |
| `PAYPAL_API_BASE` | `https://api-m.paypal.com` |
| `NEXT_PUBLIC_PAYPAL_ENV` | `live` |
| `PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | the live app's client ID |
| `PAYPAL_CLIENT_SECRET` | the live app's secret (secret) |
| `PAYPAL_WEBHOOK_ID` | the live webhook's ID |
| `PAYPAL_PARTNER_MERCHANT_ID`, `PAYPAL_BN_CODE` | from PayPal's approval |
| `DEMO_MODE` | `false` (it refuses to run with live PayPal anyway) |
| `DEMO_BUYER_EMAIL`, `DEMO_BUYER_PASSWORD` | delete (sandbox only) |
| `EVAL_STEP_SECRET` | keep, so the eval step's key isn't tied to the PayPal secret |

## 4. Before the first real job

- **Your own domain.** Live PayPal, emails and Turnstile all want a domain you
  own. Add it in Netlify. Then set `APP_URL` and the Supabase Auth site URL
  and redirect URLs to it.
- **Email.**
  - Supabase Auth's built-in mailer is for testing only. Set up custom SMTP in
    Supabase (Authentication, Emails, SMTP settings) so sign-in links reach
    anyone.
  - For Trace's own emails (job links, sign-off links), set `RESEND_API_KEY`
    and `MAIL_FROM` on a domain verified with Resend.
- **Bot check.** Create a Cloudflare Turnstile widget for the domain. Set
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on Netlify, and put the secret in Supabase
  (Authentication, Attack Protection, captcha: Turnstile).
- **Database.**
  - `DATABASE_URL` should use Supabase's transaction pooler (port 6543), with
    the `trace_app` role. Never use `postgres` or the service role.
  - A paid Supabase plan is needed for backups and no pausing.
- **Terms and privacy.** `/terms` and `/privacy` are plain starting points.
  Have them reviewed for where you operate, and add your business name and a
  contact address.
- **A small live test.** Run one job of a few dollars end to end between two
  real accounts you control: hold, prove, release, refund. Check each webhook
  arrived (the job's timeline shows them) before inviting customers.

## 5. What to watch

- `/api/health` answers 503 with reasons when the worker stops or the schema
  is behind. The `uptime` GitHub Actions workflow checks it every 15 minutes
  and a failed run emails the repository owner.
- Netlify's function logs show every money decision's outcome. The guard
  ledger in the database is the full record.
