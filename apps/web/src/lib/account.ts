import { timeZoneSchema } from "@moonx/schemas";

/** The save items of 4 Account (design-spec 6.0.2): the header's "Saved" counts both. */
export const PROFILE_KEY = "me:profile";

/** The time zone and display mode; the frame shows a display mode chosen as it saves. */
export const PREFERENCES_KEY = "me:preferences";

/** What `users.timezone` starts as when the device names no zone moonx knows (SDD 6.3). */
const FALLBACK_TIME_ZONE = "Asia/Manila";

/** The device's time zone, which a new account starts with (design-spec 6.16 3 ②). */
export function deviceTimeZone(): string {
  const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZoneSchema.safeParse(zone).success ? zone : FALLBACK_TIME_ZONE;
}
