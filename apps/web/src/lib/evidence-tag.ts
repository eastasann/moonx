import { formatDate } from "@moonx/i18n";
import type { Evidence } from "@moonx/schemas";

/** The text of an evidence chip: the research log's date and topic, or the URL. */
export function evidenceTagText(
  evidence: Evidence,
  deletedLabel: string,
  timeZone = "UTC",
): string {
  const log = evidence.researchLog;
  if (!log) return evidence.url ?? "";
  const date = log.observedOn ? `${formatDate(log.observedOn, timeZone)} ` : "";
  return `${date}${log.topic}${log.deleted ? ` (${deletedLabel})` : ""}`;
}
