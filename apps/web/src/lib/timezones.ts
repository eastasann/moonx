/** The time zone of this device, used as the default at sign-up (design-spec 6.16, screen 3). */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** IANA names for the time zone picker, with `current` always among them. */
export function timezoneOptions(current: string): string[] {
  const names = new Set<string>(
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [],
  );
  names.add("UTC");
  names.add(current);
  return [...names].sort((a, b) => a.localeCompare(b));
}
