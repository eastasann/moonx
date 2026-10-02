import type { HistorySource, UserRef, Versioned } from "@moonx/schemas";
import type { HistoryActor } from "../history/with-history";
import { requestInfo } from "./request-info";
import { userRefOrNull } from "./users";

/** UTC ISO 8601 for a timestamp (SDD 5.1). */
export const iso = (date: Date): string => date.toISOString();
/** `iso` for a nullable timestamp. */
export const isoOrNull = (date: Date | null | undefined): string | null =>
  date ? date.toISOString() : null;

/** `lockVersion` and the last editor of an item row (SDD 5.2 Versioned). */
export function versionedOf(
  row: { lockVersion: number; updatedAt: Date; updatedById: string | null },
  refs: Map<string, UserRef>,
): Versioned {
  return {
    lockVersion: row.lockVersion,
    updatedAt: iso(row.updatedAt),
    updatedBy: userRefOrNull(refs, row.updatedById),
  };
}

/** Versioned part of a keyed item that has no row yet: version 0, nobody edited it. */
export const UNSAVED: Versioned = { lockVersion: 0, updatedAt: null, updatedBy: null };

/** Who is changing what, taken from the request (client kind) and the signed-in user. */
export function historyActor(
  request: Request,
  user: { id: string },
  source: HistorySource = "manual",
  batchId: string | null = null,
): HistoryActor {
  return { userId: user.id, client: requestInfo(request).client, source, batchId };
}
