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
