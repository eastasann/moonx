import { formatRelativeTime } from "@moonx/i18n";
import type { ConflictCurrent } from "@moonx/schemas";
import {
  AlertDialog,
  Button,
  Flex,
  InlineAlert,
  Stack,
  Text,
  TextArea,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { rejectionReason, type SaveItem, unsavedText } from "../lib/autosave";
import {
  useAutosave,
  useAutosaveState,
  useSaveItem,
} from "../lib/autosave-react";
import { meQuery } from "../lib/queries";
import { ModalBoundary } from "./ErrorBoundary";

/** The words beside "Couldn't save" for a save the API refused for good (6.0.2). */
function rejectionWords(item: SaveItem, t: TFunction<["app"]>): string | null {
  if (item.status !== "rejected" || item.failure === null) return null;
  const reason = rejectionReason(item.failure);
  if (reason !== null) return t(`app:save.reason.${reason}`);
  // A refusal no rule names: unexpected, with the Ref someone asking for help quotes.
  const ref = item.failure.requestId;
  return ref === null
    ? t("app:state.unexpected")
    : t("app:state.unexpectedRef", { ref: ref.slice(0, 8) });
}

/**
 * Beside a field or row whose save failed (design-spec 6.0.2「保存できなかった項目の
 * 表示」): "Couldn't save", the reason when the API refused it for good, and Retry. A
 * failure that may pass is sent again by itself meanwhile; a lost session waits for M9.
 */
export function SaveFailureNote({ itemKey }: { itemKey: string }) {
  const { t } = useTranslation(["app"]);
  const autosave = useAutosave();
  const item = useSaveItem(itemKey);
  if (
    item === undefined ||
    (item.status !== "retrying" &&
      item.status !== "rejected" &&
      item.status !== "signedOut")
  ) {
    return null;
  }
  const rejection = rejectionWords(item, t);
  return (
    <InlineAlert variant="negative">
      <Flex gap="space-200" wrap alignItems="center">
        <Text>{t("app:state.couldNotSave")}</Text>
        {rejection !== null && <Text tone="secondary">{rejection}</Text>}
        {item.status !== "signedOut" && (
          <Button
            variant="secondary"
            size="S"
            onPress={() => autosave.retry(itemKey)}
          >
            {t("app:state.retry")}
          </Button>
        )}
      </Flex>
    </InlineAlert>
  );
}

/**
 * The conflict question of design-spec 6.0.2, for the first item someone else saved
 * first, wherever it was typed: "Paolo updated this summary 3m ago", Load theirs or
 * Overwrite with mine, and Copy my input before the input is dropped. It has no cancel:
 * the save waits for the answer (4.5 AlertDialog).
 */
export function SaveConflictDialog() {
  const state = useAutosaveState();
  // An item whose question failed to render and was closed: asked again once its save is
  // sent again (the header's Retry) and meets the conflict anew.
  const [closed, setClosed] = useState<ConflictCurrent | null>(null);
  const item = [...(state?.items.values() ?? [])].find(
    (candidate) =>
      candidate.status === "conflict" && candidate.conflict !== closed,
  );
  if (item?.conflict == null) return null;
  const { conflict } = item;
  return (
    <ModalBoundary key={item.key} onClose={() => setClosed(conflict)}>
      <ConflictQuestion item={item} current={item.conflict} />
    </ModalBoundary>
  );
}

function ConflictQuestion({
  item,
  current,
}: {
  item: SaveItem;
  current: ConflictCurrent;
}) {
  const autosave = useAutosave();
  return (
    <ConflictAlert
      noun={item.noun}
      current={current}
      input={unsavedText(item)}
      onOverwrite={() => autosave.resolveConflict(item.key, "overwrite")}
      onLoadTheirs={() => autosave.resolveConflict(item.key, "loadTheirs")}
    />
  );
}

/**
 * The words and choices of design-spec 6.0.2's conflict question: "{name} updated this
 * {noun} {when}", Overwrite with mine or Load theirs, and Copy my input with the input
 * Load theirs drops (`input`, as text; null for a send that dropped nothing typed). No
 * cancel: the save waits for the answer. For a send outside the page's saves too (M2's
 * evidence, ADR-019).
 */
export function ConflictAlert({
  noun,
  current,
  input,
  onOverwrite,
  onLoadTheirs,
}: {
  noun: string;
  current: ConflictCurrent;
  input: string | null;
  onOverwrite: () => void;
  onLoadTheirs: () => void;
}) {
  const { t } = useTranslation(["app"]);
  const { data: me } = useQuery(meQuery());
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const when = formatRelativeTime(current.updatedAt, {
    timeZone: me?.timezone ?? "UTC",
  });
  const copy = () => {
    // No clipboard (not offered outside a secure page, or not allowed): the input then
    // shows here to be selected, the field being behind the question.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(input ?? ""))
      .then(
        () => setCopied("copied"),
        () => setCopied("failed"),
      );
  };
  return (
    <AlertDialog
      isOpen
      variant="warning"
      size="S"
      title={
        current.updatedBy === null
          ? t("app:save.conflict.titleSomeone", { noun, when })
          : t("app:save.conflict.title", {
              name: current.updatedBy.displayName,
              noun,
              when,
            })
      }
      primaryActionLabel={t("app:save.conflict.overwrite")}
      secondaryActionLabel={t("app:save.conflict.loadTheirs")}
      onPrimaryAction={onOverwrite}
      onSecondaryAction={onLoadTheirs}
    >
      <Stack gap="space-200">
        <Text>{t("app:save.conflict.body")}</Text>
        {input !== null && (
          <Flex gap="space-100" alignItems="center" wrap>
            <Button variant="secondary" size="S" onPress={copy}>
              {t("app:save.conflict.copy")}
            </Button>
            {/* Read out when the copy is done. */}
            <output>
              {copied !== null && (
                <Text variant="caption" tone="secondary">
                  {copied === "copied"
                    ? t("app:save.conflict.copied")
                    : t("app:save.conflict.copyFailed")}
                </Text>
              )}
            </output>
          </Flex>
        )}
        {input !== null && copied === "failed" && (
          <TextArea
            label={t("app:save.conflict.yourInput")}
            value={input}
            isReadOnly
            width="full"
          />
        )}
      </Stack>
    </AlertDialog>
  );
}
