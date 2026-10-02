import type { TemplateQuestion } from "@moonx/schemas";
import { Button, ContextualHelp, Disclosure, Flex, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { errorText } from "../../lib/error-text";
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
  const { t } = useTranslation("form");
  const { failure } = item;
  if (!failure) return null;
  return (
    <Flex gap="space-100" align="center" wrap>
      <Text tone="negative" as="span">
        {failure.willRetry ? t("form:saveFailed") : errorText(t, failure.error)}
      </Text>
      <Button variant="secondary" size="S" onPress={() => item.retry(resend())}>
        {t("form:retry")}
      </Button>
    </Flex>
  );
}
