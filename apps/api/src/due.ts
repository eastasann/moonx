import { type Database, type DatabaseTransaction, users } from "@moonx/db";
import { formatIsoDate } from "@moonx/i18n";
import { eq } from "drizzle-orm";

/** How far ahead Due soon looks, in days (design-spec 6.9). */
const DUE_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The days that decide what is overdue and what is due soon, as dates. */
export interface DueWindow {
  /** Items due before this date are overdue. */
  today: string;
  /** The last day Due soon reaches. */
  until: string;
}

/**
 * Today and the last day of Due soon in `userId`'s time zone (design-spec 6.9): the
 * dates execution items are due on carry no time of day, so they fall due by the
 * caller's calendar.
 */
export async function dueWindow(
  db: Database | DatabaseTransaction,
  userId: string,
  now: Date,
): Promise<DueWindow> {
  const [me] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  const today = formatIsoDate(now, { timeZone: me?.timezone ?? "UTC" });
  const until = new Date(
    Date.parse(`${today}T00:00:00Z`) + DUE_SOON_DAYS * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  return { today, until };
}
