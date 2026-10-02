import { createI18n } from "@moonx/i18n";

/**
 * The API's own i18n instance for text it composes itself: labels in the activity feed, the name
 * of a deleted user (SDD 9). English only for now, so one instance serves every request.
 */
export const i18n = createI18n();
