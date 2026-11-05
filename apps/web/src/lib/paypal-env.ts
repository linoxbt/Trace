/** Whether this build runs on PayPal's sandbox. Set NEXT_PUBLIC_PAYPAL_ENV=live (with the live PayPal settings) to go live. */
export const SANDBOX = process.env.NEXT_PUBLIC_PAYPAL_ENV !== "live";
