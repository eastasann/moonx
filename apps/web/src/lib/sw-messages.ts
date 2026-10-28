/**
 * What a page posts to the waiting service worker when the user chooses Reload
 * (design-spec 6.0.6「新しい版がある」): src/sw.ts then takes over from the old one.
 */
export const SKIP_WAITING = "moonx:skip-waiting";
