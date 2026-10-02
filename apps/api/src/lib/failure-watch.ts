/** SDD 8.3: more than this many 401 / 403 answers to one IP address within the window is "多発". */
export const FAILURE_BURST = { limit: 10, windowMs: 60_000 } as const;

/**
 * Counts 401 / 403 answers per IP address so the access log can raise them to `warn` during a
 * burst. The counts live in this instance's memory: they only choose a log level, so instances
 * need not agree.
 */
export function createFailureWatch() {
  const hits = new Map<string, number[]>();
  let prunedAt = 0;
  return {
    /** Records one 401 / 403 and says whether the address is now in a burst. */
    record(ip: string, nowMs: number): boolean {
      const recent = (hits.get(ip) ?? []).filter((at) => at > nowMs - FAILURE_BURST.windowMs);
      recent.push(nowMs);
      hits.set(ip, recent);
      // Dropping idle addresses once a window keeps the map small without a scan per request.
      if (nowMs - prunedAt >= FAILURE_BURST.windowMs) {
        prunedAt = nowMs;
        for (const [key, times] of hits) {
          if ((times.at(-1) ?? 0) <= nowMs - FAILURE_BURST.windowMs) hits.delete(key);
        }
      }
      return recent.length > FAILURE_BURST.limit;
    },
  };
}
