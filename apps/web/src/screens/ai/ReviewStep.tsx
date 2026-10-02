import {
  Button,
  Disclosure,
  Flex,
  InlineAlert,
  RowList,
  RowListItem,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import type { ReviewDraft, ReviewEntry } from "../../lib/ai-review";
import { ReviewEntryCard } from "./ReviewEntryCard";

export interface ReviewStepProps {
  entries: readonly ReviewEntry[];
  currency: string | null;
  /** Question keys whose answer was saved by someone after the import was opened. */
  updatedAfterLoad: ReadonlySet<string>;
  /** An apply came back as a conflict: Current was refreshed and the person is asked again. */
  conflict: boolean;
  onDraft: (questionKey: string, patch: Partial<ReviewDraft>) => void;
  onClose: () => void;
}

/**
 * The Review step (design-spec 6.7 ③). Questions whose imported content equals the answer now are
 * folded away and never applied; the rest are listed with a checkbox that starts on.
 */
export function ReviewStep({
  entries,
  currency,
  updatedAfterLoad,
  conflict,
  onDraft,
  onClose,
}: ReviewStepProps) {
  const { t } = useTranslation("ai");
  const changed = entries.filter((e) => e.evaluation.changed);
  const unchanged = entries.filter((e) => !e.evaluation.changed);

  return (
    <Stack gap="space-300">
      {conflict ? (
        <InlineAlert variant="notice" heading={t("import.review.conflict")}>
          {t("import.review.conflictBody")}
        </InlineAlert>
      ) : null}
      {changed.length === 0 ? (
        <InlineAlert variant="informative" heading={t("import.review.noChanges")}>
          <Stack gap="space-200">
            <Text>{t("import.review.noChangesBody")}</Text>
            <Flex justify="start">
              <Button variant="secondary" onPress={onClose}>
                {t("import.review.close")}
              </Button>
            </Flex>
          </Stack>
        </InlineAlert>
      ) : (
        changed.map((entry) => (
          <ReviewEntryCard
            key={entry.question.questionKey}
            entry={entry}
            currency={currency}
            updatedAfterLoad={updatedAfterLoad.has(entry.question.questionKey)}
            onDraft={(patch) => onDraft(entry.question.questionKey, patch)}
          />
        ))
      )}
      {unchanged.length > 0 ? (
        <Disclosure
          title={t("import.review.unchanged", { count: unchanged.length })}
          headingLevel={3}
        >
          <RowList aria-label={t("import.review.unchangedItem")}>
            {unchanged.map((entry) => (
              <RowListItem key={entry.question.questionKey}>
                {entry.question.questionKey} {entry.question.title}
              </RowListItem>
            ))}
          </RowList>
        </Disclosure>
      ) : null}
    </Stack>
  );
}
