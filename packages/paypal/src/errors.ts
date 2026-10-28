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

  /** Safe to retry with the same PayPal-Request-Id. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }

  static async from(res: Response): Promise<PayPalError> {
    let body: unknown = undefined;
    const text = await res.text();
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
      res.status,
      b.name ?? b.error ?? "UNKNOWN_ERROR",
      b.message ?? b.error_description ?? res.statusText,
      (b.details ?? []).map((d) => d.issue).filter((i): i is string => !!i),
      b.debug_id ?? res.headers.get("paypal-debug-id") ?? undefined,
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

export function isRetryable(err: unknown): boolean {
  return (err instanceof PayPalError && err.retryable) || err instanceof PayPalNetworkError;
}
