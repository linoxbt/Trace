"use client";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** Call one of our API routes; throws ApiError with the server's plain-words message. */
export async function api<T = unknown>(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.json !== undefined || init.form ? "POST" : "GET"),
    headers: init.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    // Answers that didn't come from Trace's routes (the host's own limits) still get plain words.
    const fallback =
      res.status === 413 ? "That upload is too large: send a smaller file or photo."
      : res.status === 504 || res.status === 502 ? "The server took too long to answer. Refresh to see where things stand."
      : `request failed (${res.status})`;
    throw new ApiError(res.status, data.error ?? "error", data.message ?? fallback);
  }
  return data as T;
}

/** A stable random ID for this browser, used for the device-continuity check. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("trace-device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("trace-device", id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

export function position(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}
