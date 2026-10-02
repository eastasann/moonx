import type { ResearchLogEntry } from "@moonx/schemas";
import {
  ActionButton,
  ActionMenu,
  AlertDialog,
  Flex,
  Heading,
  Link,
  MenuItem,
  RowList,
  RowListItem,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { RowEditorNotices } from "../../components/RowEditorNotices";
import { RowFields } from "../../components/RowFields";
import { autosave } from "../../lib/autosave";
import { errorText } from "../../lib/error-text";
import { linkTargetPath } from "../../lib/link-target";
import { formatItemTarget } from "../../lib/panel-target";
import { deleteResearchEntry, type ResearchLogDetail, researchLogSpecs } from "../../lib/research";
import { toasts } from "../../lib/toast";
import { useRowEditor } from "../../lib/use-row-editor";
import { researchEntryKey, researchLogKey } from "../../lib/validation-keys";

export interface ResearchEntryPaneProps {
  workspaceId: string;
  validationId: string;
  detail: ResearchLogDetail;
  canEdit: boolean;
  currency: string;
  timeZone: string;
  /** Called with the closed entry after it was deleted. */
  onDeleted: () => void;
  /** Below desktop the detail has the whole width; this returns to the list. */
  onBack?: () => void;
  /** Marks 13 and 6 stale after a change. */
  onChanged: () => void;
}

/**
 * The right pane of 14 (design-spec 6.10): one entry's fields with autosave, the items that use
 * it as evidence, and its delete with the confirmation of 6.0.3 for an entry that is evidence.
 */
export function ResearchEntryPane({
  workspaceId,
  validationId,
  detail,
  canEdit,
  currency,
  timeZone,
  onDeleted,
  onBack,
  onChanged,
}: ResearchEntryPaneProps) {
  const { t } = useTranslation(["research", "form", "app"]);
  const queryClient = useQueryClient();
  const specs = useMemo(() => researchLogSpecs(t), [t]);
  const entryKey = researchEntryKey(validationId, detail.id);
  const [confirming, setConfirming] = useState(false);

  const editor = useRowEditor<ResearchLogEntry>({
    row: detail,
    specs,
    itemKey: `research:${detail.id}`,
    url: `/api/v1/research-log/${detail.id}`,
    isReadOnly: !canEdit,
    onSaved: (saved) => {
      queryClient.setQueryData<ResearchLogDetail>(entryKey, (old) =>
        old ? { ...old, ...saved } : old,
      );
      void queryClient.invalidateQueries({ queryKey: researchLogKey(validationId) });
      onChanged();
    },
    onSentElsewhere: () => void queryClient.invalidateQueries({ queryKey: entryKey }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      // Input still on its way would be saved to an entry that is gone.
      await editor.flush();
      await autosave.idle();
      return deleteResearchEntry(detail.id);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: entryKey });
      void queryClient.invalidateQueries({ queryKey: researchLogKey(validationId) });
      onChanged();
      toasts.add({ title: t("research:log.deleted"), variant: "informative" });
      onDeleted();
    },
    onError: (error) =>
      toasts.add({
        title: t("research:log.deleteFailed"),
        description: errorText(t, error),
        variant: "negative",
      }),
  });

  const target = formatItemTarget("research_log_entry", detail.id);
  const { usages } = detail;
  const title = String(editor.draft.topic ?? "").trim() || detail.topic;

  return (
    <Stack gap="space-300">
      {onBack ? (
        <Flex>
          <ActionButton icon={<ArrowLeft />} onPress={onBack}>
            {t("research:log.backToList")}
          </ActionButton>
        </Flex>
      ) : null}
      <Flex gap="space-200" justify="between" align="center">
        <Heading level={2}>{title}</Heading>
        <Flex gap="space-50" align="center">
          <ItemPanelButtons target={target} commentCount={detail.commentCount} />
          {canEdit ? (
            <ActionMenu
              label={t("research:log.menu", { name: title })}
              size="S"
              onAction={(key) => {
                if (key === "delete") setConfirming(true);
              }}
            >
              <MenuItem id="delete" variant="negative">
                {t("research:log.delete")}
              </MenuItem>
            </ActionMenu>
          ) : null}
        </Flex>
      </Flex>
      <RowFields
        specs={specs}
        values={editor.draft}
        revision={editor.revision}
        problems={editor.problems}
        isReadOnly={!canEdit}
        currency={currency}
        timeZone={timeZone}
        onChange={editor.change}
        onBlur={() => void editor.flush()}
      />
      <RowEditorNotices editor={editor} specs={specs} itemName={t("research:log.itemName")} />
      <Stack gap="space-100">
        <Heading level={3}>{t("research:log.usedAsEvidence")}</Heading>
        {usages.length === 0 ? (
          <Text tone="secondary">{t("research:log.notUsed")}</Text>
        ) : (
          <RowList aria-label={t("research:log.usedAsEvidence")}>
            {usages.map((usage) => {
              const path = linkTargetPath(usage.link, { workspaceId });
              return (
                <RowListItem
                  key={`${usage.target.type}:${usage.target.id}:${usage.target.key ?? ""}`}
                >
                  {path ? <Link href={path}>{usage.label}</Link> : <Text>{usage.label}</Text>}
                </RowListItem>
              );
            })}
          </RowList>
        )}
      </Stack>
      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        variant="negative"
        title={t("research:log.confirm.title", { name: title })}
        primaryActionLabel={t("research:log.confirm.confirm")}
        cancelLabel={t("app:cancel")}
        onPrimaryAction={() => remove.mutate()}
      >
        <Stack gap="space-200">
          <Text>
            {usages.length > 0
              ? t("research:log.confirm.used", { count: usages.length })
              : t("research:log.confirm.unused")}
          </Text>
          {usages.length > 0 ? (
            <RowList aria-label={t("research:log.usedAsEvidence")}>
              {usages.map((usage) => (
                <RowListItem
                  key={`${usage.target.type}:${usage.target.id}:${usage.target.key ?? ""}`}
                >
                  <Text>
                    {usage.label}
                    {usage.isOnlyEvidenceOfFact
                      ? ` · ${t("research:log.confirm.onlyEvidence")}`
                      : ""}
                  </Text>
                </RowListItem>
              ))}
            </RowList>
          ) : null}
          <Text tone="secondary">{t("research:log.confirm.restore")}</Text>
        </Stack>
      </AlertDialog>
    </Stack>
  );
}
