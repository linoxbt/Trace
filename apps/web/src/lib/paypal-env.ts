/** Whether this build runs on PayPal's sandbox: set at build from PAYPAL_API_BASE (next.config.ts). */
export const SANDBOX = process.env.NEXT_PUBLIC_PAYPAL_ENV !== "live";
