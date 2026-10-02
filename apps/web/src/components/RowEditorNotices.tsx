import { Button, Flex, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { errorText } from "../lib/error-text";
import type { FieldSpec } from "../lib/row-fields";
import { describeFields } from "../lib/row-fields";
import type { RowEditor } from "../lib/use-row-editor";
import { ConflictDialog } from "./ConflictDialog";

/**
 * What a row editor reports besides its fields: a save that failed, with Retry, and the choice
 * after another person saved the row first (design-spec 6.0.2).
 */
export function RowEditorNotices({
  editor,
  specs,
  itemName,
}: {
  editor: RowEditor;
  specs: readonly FieldSpec[];
  /** What the row is called in the sentence "Paolo updated this {itemName} 3 minutes ago". */
  itemName: string;
}) {
  const { t } = useTranslation(["form", "app"]);
  const { item } = editor;
  const { failure } = item;
  return (
    <>
      {failure ? (
        <Flex gap="space-100" align="center" wrap>
          <Text tone="negative" as="span">
            {failure.willRetry ? t("form:saveFailed") : errorText(t, failure.error)}
          </Text>
          <Button variant="secondary" size="S" onPress={editor.retry}>
            {t("form:retry")}
          </Button>
        </Flex>
      ) : null}
      <ConflictDialog
        current={item.conflict}
        itemName={itemName}
        theirText={describeFields(specs, item.conflict?.value as Record<string, unknown>)}
        mineText={describeFields(specs, item.mine ?? undefined)}
        onLoadTheirs={item.loadTheirs}
        onKeepMine={item.keepMine}
      />
    </>
  );
}
