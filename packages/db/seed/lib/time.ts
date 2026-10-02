const HOUR = 60 * 60 * 1000;
const MANILA_OFFSET_HOURS = 8;

/**
 * Seed timestamps are relative to the run, so "overdue" and "due in 2 days" stay true. Days are
 * Manila calendar days (the demo users' time zone), and no instant is later than the run.
 */
export function createClock(now: Date = new Date()) {
  const manilaDay = (offsetDays: number) => {
    const d = new Date(now.getTime() + MANILA_OFFSET_HOURS * HOUR);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d;
  };
  return {
    now,
    /** The moment at the given Manila hour, `days` calendar days before today, capped at now. */
    ago(days: number, hour = 10): Date {
      const d = manilaDay(-days);
      const at = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        hour - MANILA_OFFSET_HOURS,
      );
      return new Date(Math.min(at, now.getTime()));
    },
    /** The Manila calendar date `days` from today (negative = past). */
    date(days: number): string {
      return manilaDay(days).toISOString().slice(0, 10);
    },
  };
}

export type Clock = ReturnType<typeof createClock>;
