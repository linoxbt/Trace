// PayPal error responses: { name, message, debug_id, details: [{ issue, description }] }.

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly errorName: string,
    message: string,
    readonly issues: string[],
    readonly debugId: string | undefined,
    readonly body: unknown,
  ) {
    super(`PayPal ${status} ${errorName}${issues.length ? ` [${issues.join(", ")}]` : ""}: ${message}`);
    this.name = "PayPalError";
  }

  has(issue: string): boolean {
    return this.issues.includes(issue) || this.errorName === issue;
  }

  /**
   * Safe to retry with the same PayPal-Request-Id. A 401 is an expired or
   * revoked token: PayPal refused before acting, and the client fetches a new
   * one, so the attempt (say, the single reauthorization) isn't used up.
   */
  get retryable(): boolean {
    return this.status === 401 || this.status === 429 || this.status >= 500;
  }

  static async from(res: Response): Promise<PayPalError> {
    return PayPalError.fromText(res.status, res.statusText, await res.text(), res.headers.get("paypal-debug-id") ?? undefined);
  }

  /** From a status and the raw body, however the response arrived (fetch, or the SDK's ApiError). */
  static fromText(status: number, statusText: string, text: string, debugHeader?: string): PayPalError {
    let body: unknown = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    const b = (body && typeof body === "object" ? body : {}) as {
      name?: string;
      error?: string;
      message?: string;
      error_description?: string;
      debug_id?: string;
      details?: { issue?: string }[];
    };
    return new PayPalError(
      status,
      b.name ?? b.error ?? "UNKNOWN_ERROR",
      b.message ?? b.error_description ?? statusText,
      (b.details ?? []).map((d) => d.issue).filter((i): i is string => !!i),
      b.debug_id ?? debugHeader,
      body,
    );
  }
}

/** A request that never got an HTTP answer (DNS, reset, timeout). Retry with the same request ID. */
export class PayPalNetworkError extends Error {
  readonly retryable = true;
  constructor(override readonly cause: unknown) {
    super(`PayPal request failed before a response: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PayPalNetworkError";
  }
}

/** A request the client refused to send (it failed its own checks): nothing reached PayPal, so nothing moved. */
export class PayPalRequestInvalid extends Error {
  constructor(override readonly cause: unknown) {
    super(`PayPal request not sent: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PayPalRequestInvalid";
  }
}

/** A PayPal answer that settles the outcome: a refusal, or a request never sent. Anything else may have moved money. */
export function isDefinitiveFailure(err: unknown): boolean {
  return (err instanceof PayPalError && !err.retryable) || err instanceof PayPalRequestInvalid;
}

export function isRetryable(err: unknown): boolean {
  return (err instanceof PayPalError && err.retryable) || err instanceof PayPalNetworkError;
}
