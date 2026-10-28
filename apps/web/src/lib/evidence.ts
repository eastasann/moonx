import { formatDate } from "@moonx/i18n";
import type { Evidence, ResearchLogEntry } from "@moonx/schemas";

/**
 * The evidence that counts (design-spec 6.0.3): URLs, and research logs not deleted. A
 * link to a deleted research log stays, uncounted, until it is removed or the log is
 * restored.
 */
export const countingEvidence = (evidence: readonly Evidence[]) =>
  evidence.filter(
    (item) => item.kind === "url" || item.researchLog?.deleted === false,
  );

/**
 * How a research log entry reads in a list or a chip: its date, when it has one, and its
 * topic ("Sep 12 Store observation: SM City", 6.0.3's chip).
 */
export function researchLogLabel(
  entry: Pick<ResearchLogEntry, "observedOn" | "topic">,
  timeZone: string,
): string {
  return entry.observedOn === null
    ? entry.topic
    : `${formatDate(entry.observedOn, { timeZone })} ${entry.topic}`;
}

/** A chip of evidence (6.0.3): a research log by its date and topic, a URL by itself. */
export function evidenceLabel(evidence: Evidence, timeZone: string): string {
  if (evidence.researchLog !== null) {
    return researchLogLabel(evidence.researchLog, timeZone);
  }
  return evidence.url ?? "";
}
