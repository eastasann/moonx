import { formatRelativeTime } from "@moonx/i18n";
import type { ConflictCurrent } from "@moonx/schemas";
import { Button, Dialog, InlineAlert, Stack, Text } from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMe } from "../lib/session";

export interface ConflictDialogProps {
  /** The other person's saved copy; the dialog is open while it is set. */
  current: ConflictCurrent | null;
  /** What the item is called in the sentence, such as "answer" or "row". */
  itemName: string;
  /** The other copy as text, shown so the choice can be made. */
  theirText: string | null;
  /** The person's own unsent text, which "Copy my input" puts on the clipboard. */
  mineText: string | null;
  onLoadTheirs: () => void;
  onKeepMine: () => void;
}

/**
 * The choice after a 409 (design-spec 6.0.2): load the other person's content and drop one's own,
 * or overwrite it with one's own. Their content stays in the change history either way, so
 * overwriting can be undone. The input can be copied before it is dropped. Closing the dialog is
 * not a choice, so it has no way out other than the two buttons.
 */
export function ConflictDialog({
  current,
  itemName,
  theirText,
  mineText,
  onLoadTheirs,
  onKeepMine,
}: ConflictDialogProps) {
  const { t } = useTranslation("form");
  const me = useMe();
  const [copyFailed, setCopyFailed] = useState(false);
  const who = current?.updatedBy?.displayName ?? t("conflict.someone");
  const when = current ? formatRelativeTime(current.updatedAt, new Date(), me.timezone) : "";
  return (
    <Dialog
      isOpen={current !== null}
      // Closing is not a choice: the dialog ends only through its two buttons.
      onOpenChange={() => {}}
      isKeyboardDismissDisabled
      isCloseHidden
      title={t("conflict.title")}
      closeLabel={t("conflict.closeLabel")}
      size="medium"
      actions={
        <>
          <Button variant="secondary" onPress={onLoadTheirs}>
            {t("conflict.loadTheirs")}
          </Button>
          <Button onPress={onKeepMine}>{t("conflict.keepMine")}</Button>
        </>
      }
    >
      <Stack gap="space-200">
        <Text>{t("conflict.message", { who, item: itemName, when })}</Text>
        {theirText ? (
          <Stack gap="space-50">
            <Text variant="label">{t("conflict.theirs")}</Text>
            <Text variant="body-long">{theirText}</Text>
          </Stack>
        ) : null}
        {mineText ? (
          <Stack gap="space-100" align="start">
            <Text variant="label">{t("conflict.mine")}</Text>
            <Text variant="body-long">{mineText}</Text>
            <Button
              variant="secondary"
              size="S"
              onPress={() => {
                navigator.clipboard.writeText(mineText).then(
                  () => setCopyFailed(false),
                  () => setCopyFailed(true),
                );
              }}
            >
              {t("conflict.copyMine")}
            </Button>
            {copyFailed ? (
              <InlineAlert variant="notice" heading={t("conflict.copyFailed")} />
            ) : null}
          </Stack>
        ) : null}
        <Text variant="caption" tone="secondary">
          {t("conflict.historyNote")}
        </Text>
      </Stack>
    </Dialog>
  );
}
