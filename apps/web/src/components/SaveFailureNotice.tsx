import { Button, Flex, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { errorText } from "../lib/error-text";
import type { SavedItem } from "../lib/use-saved-item";

/**
 * The failed save of one field or row, drawn beside it with its Retry (design-spec 6.0.2). A save
 * the server refused for good (archived, no permission, gone) says "Couldn't save" and gives the
 * reason, so it never reads like a lost connection that fixes itself.
 */
export function SaveFailureNotice({
  failure,
  onRetry,
}: {
  failure: NonNullable<SavedItem["failure"]>;
  onRetry: () => void;
}) {
  const { t } = useTranslation("form");
  return (
    <Flex gap="space-100" align="center" wrap>
      {failure.willRetry ? (
        <Text tone="negative" as="span">
          {t("saveFailed")}
        </Text>
      ) : (
        <>
          <Text tone="negative" as="span">
            {t("saveRefused")}
          </Text>
          <Text tone="negative" as="span">
            {errorText(t, failure.error)}
          </Text>
        </>
      )}
      <Button variant="secondary" size="S" onPress={onRetry}>
        {t("retry")}
      </Button>
    </Flex>
  );
}
