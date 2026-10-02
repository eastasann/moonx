const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, found);
  }
  return found;
}

function wallClock(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  );
  return {
    year: parts.year as number,
    month: parts.month as number,
    day: parts.day as number,
    hour: parts.hour as number,
    minute: parts.minute as number,
    second: parts.second as number,
  };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * The calendar date (`"2026-10-01"`) and the hour (0-23) an instant has in an IANA time zone.
 * Throws a RangeError for a name the runtime does not know.
 */
export function localTime(at: Date, timeZone: string): { date: string; hour: number } {
  const w = wallClock(at, timeZone);
  return { date: `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`, hour: w.hour };
}

/** `date` moved by `days` calendar days (no time zone involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The instant a calendar day starts in an IANA time zone. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const wall = new Date(`${date}T00:00:00Z`).getTime();
  const offsetAt = (instant: number) => {
    const w = wallClock(new Date(instant), timeZone);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - instant;
  };
  const first = wall - offsetAt(wall);
  // Across a daylight-saving change the offset at the guess differs from the offset at the answer.
  const second = wall - offsetAt(first);
  return new Date(second);
}

/** The `users.timezone` column default, used when a stored name is not a time zone the runtime knows. */
export const DEFAULT_TIME_ZONE = "Asia/Manila";

/** `timeZone` itself when the runtime knows it, otherwise {@link DEFAULT_TIME_ZONE}. */
export function resolveTimeZone(timeZone: string): string {
  try {
    formatterFor(timeZone);
    return timeZone;
  } catch (error) {
    if (error instanceof RangeError) return DEFAULT_TIME_ZONE;
    throw error;
  }
}
