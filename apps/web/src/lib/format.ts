export function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/**
 * A date and time. Pass the zone from useZone() when rendering: the server and
 * the first render in the browser both use UTC, so they match, and the browser
 * then shows the viewer's own time.
 */
export function when(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

export function clock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

/** "Today", "Yesterday", or the day's name and date, in the given zone. */
export function dayOf(iso: string, timeZone?: string, now = Date.now()): string {
  const key = (t: number) => new Date(t).toLocaleDateString("en-CA", timeZone ? { timeZone } : {});
  const d = new Date(iso).getTime();
  if (key(d) === key(now)) return "Today";
  if (key(d) === key(now - 86_400_000)) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", ...(timeZone ? { timeZone } : {}) });
}
