import { randomUUIDv5 } from "bun";

// Fixed for good: changing it changes every seeded id, which SDD 6.5 promises stay put
// across runs.
const NAMESPACE = "6f1d2c4e-8a3b-4f5e-9c7d-2b1a0e3f4d5c";

/**
 * The id of a seeded row, derived from a name (a UUID v5), so `make db-seed` gives the
 * same row the same id on every run (SDD 6.5). Callers name rows by what they are
 * ("idea", "piaya"). The one exception is `seedIdSequence`.
 */
export const seedId = (...parts: (string | number)[]): string =>
  randomUUIDv5(parts.join("/"), NAMESPACE);

/**
 * Ids for the rows the template import creates: the n-th call returns
 * `seedId(...parts, n)`. The import asks for ids in an order the file fixes
 * (`ImportOptions.newId`), so the same file gives the same ids.
 */
export const seedIdSequence = (...parts: (string | number)[]) => {
  let next = 0;
  return () => seedId(...parts, next++);
};
