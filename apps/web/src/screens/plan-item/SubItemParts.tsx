import type { TemplateQuestion } from "@moonx/schemas";
import { ContextualHelp, Disclosure, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { SaveFailureNotice } from "../../components/SaveFailureNotice";
import type { SavedItem } from "../../lib/use-saved-item";

/** The Example of a sub-item, open by default (design-spec 6.12), and its hint. */
export function ExampleAndHint({ question }: { question: TemplateQuestion }) {
  const { t } = useTranslation("form");
  return (
    <>
      {question.example ? (
        <Disclosure title={t("form:example")} defaultExpanded headingLevel={2}>
          <Text variant="body-long">{question.example}</Text>
        </Disclosure>
      ) : null}
      {question.hint ? (
        <ContextualHelp label={t("form:hint")} title={t("form:hint")}>
          <Text>{question.hint}</Text>
        </ContextualHelp>
      ) : null}
    </>
  );
}

/** The failed save of a sub-item with its Retry (design-spec 6.0.2). */
export function SaveFailure({
  item,
  resend,
}: {
  item: SavedItem;
  /** The sub-item's whole current input, sent again when the server refused the save. */
  resend: () => Record<string, unknown>;
}) {
  const { failure } = item;
  if (!failure) return null;
  return <SaveFailureNotice failure={failure} onRetry={() => item.retry(resend())} />;
}
