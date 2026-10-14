// Every time in the demo data is relative to the moment the seed runs, so an item "2 days
// from now" or "overdue" stays that way whenever the seed is run (design-spec 8.4).

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Calendar dates are counted in the demo users' time zone (users.timezone defaults to it),
// so "today" matches what they see on the screens.
const TIME_ZONE = "Asia/Manila";

/** Times and dates relative to the seed's run. */
export interface SeedClock {
  readonly now: Date;
  /** The moment `days` days and `hours` hours before now. */
  ago(days: number, hours?: number): Date;
  /** The calendar date `days` days after today in Asia/Manila (negative: before). */
  date(days: number): string;
}

export function seedClock(now: Date): SeedClock {
  // en-CA formats a date as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
  }).format(now);
  const todayUtc = Date.parse(`${today}T00:00:00.000Z`);
  return {
    now,
    ago: (days, hours = 0) =>
      new Date(now.getTime() - days * DAY - hours * HOUR),
    date: (days) => new Date(todayUtc + days * DAY).toISOString().slice(0, 10),
  };
}
