/**
 * Query keys of the validation of one idea. Every query that reads a validation's data starts
 * with `["validations", validationId]`, so one invalidation after a change refreshes them all.
 */
export const validationKey = (validationId: string) => ["validations", validationId] as const;

/** V2: one section of the question form. */
export const sectionKey = (validationId: string, section: string) =>
  [...validationKey(validationId), "section", section] as const;

/** V6: the research log, optionally filtered. */
export const researchLogKey = (validationId: string, filters: Record<string, unknown> = {}) =>
  [...validationKey(validationId), "research-log", filters] as const;

/** V7: one research log entry with the items that use it as evidence. */
export const researchEntryKey = (validationId: string, entryId: string) =>
  [...validationKey(validationId), "research-entry", entryId] as const;

/** V8: the competitors and the two pattern answers of 15. */
export const competitorsKey = (validationId: string) =>
  [...validationKey(validationId), "competitors"] as const;

/** V10: the assumptions of 16. */
export const assumptionsKey = (validationId: string) =>
  [...validationKey(validationId), "assumptions"] as const;

/** V10: the risks of 16, in the order the server returns them. */
export const risksKey = (validationId: string) =>
  [...validationKey(validationId), "risks"] as const;
