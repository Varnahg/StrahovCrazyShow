export const SESSION_RECONNECT_TTL_MS = 30 * 60_000;
export const SESSION_ISSUE_WINDOW_MS = 60_000;
export const MAX_SESSION_ISSUE_ADDRESSES = 4096;

/** Remove expired tokens only after the identity has disconnected. */
export function expireSessions<T extends { id: string; expires: number }>(
  sessions: Map<string, T>,
  connected: { has(id: string): boolean },
  now = Date.now(),
): string[] {
  const expired = new Set<string>();
  const retained = new Set<string>();
  for (const [token, session] of sessions) {
    if (session.expires <= now && !connected.has(session.id)) {
      sessions.delete(token);
      expired.add(session.id);
    } else retained.add(session.id);
  }
  // Normally each identity has one token; do not purge an identity if another
  // valid token still retains it.
  return [...expired].filter((id) => !retained.has(id));
}

function trimWindow(timestamps: number[], window: number, now: number) {
  let expired = 0;
  while (expired < timestamps.length && now - timestamps[expired] >= window)
    expired++;
  if (expired) timestamps.splice(0, expired);
}

/** Reuse the small timestamp buffer, including when a request is rejected. */
export function consumeRate(
  rates: Map<string, number[]>,
  key: string,
  limit: number,
  window: number,
  now = Date.now(),
  maxKeys = Infinity,
): boolean {
  let timestamps = rates.get(key);
  if (timestamps) trimWindow(timestamps, window, now);
  else {
    // A periodic prune releases expired buckets. At capacity new addresses are
    // rejected rather than evicting a live rate limit and letting it be bypassed.
    if (rates.size >= maxKeys) return false;
    timestamps = [];
    rates.set(key, timestamps);
  }
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  return true;
}

export function pruneRateWindows(
  rates: Map<string, number[]>,
  window: number,
  now = Date.now(),
): number {
  let removed = 0;
  for (const [key, timestamps] of rates) {
    trimWindow(timestamps, window, now);
    if (timestamps.length === 0) {
      rates.delete(key);
      removed++;
    }
  }
  return removed;
}
