import type { Competitor } from "@moonx/schemas";
import { ActionMenu, AlertDialog, Button, Dialog, MenuItem, Stack, Text } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RowEditorNotices } from "../../components/RowEditorNotices";
import { RowEvidence } from "../../components/RowEvidence";
import { RowFields } from "../../components/RowFields";
import type { CompetitorsData } from "../../lib/research";
import type { FieldSpec } from "../../lib/row-fields";
import { useRowEditor } from "../../lib/use-row-editor";
import { competitorsKey } from "../../lib/validation-keys";

export interface CompetitorDialogProps {
  validationId: string;
  competitor: Competitor;
  specs: readonly FieldSpec[];
  canEdit: boolean;
  currency: string;
  timeZone: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onClose: () => void;
  /** Marks 13 and 6 stale after a change. */
  onChanged: () => void;
}

/**
 * One competitor, opened from its card (design-spec 6.10). Pattern E has no detail pane, so it
 * opens in a dialog, which is a tray on a phone. Fields save as they are filled in; the evidence
 * goes through the evidence sheet. A Viewer reads the same fields as text.
 */
export function CompetitorDialog({
  validationId,
  competitor,
  specs,
  canEdit,
  currency,
  timeZone,
  isFirst,
  isLast,
  onMove,
  onDelete,
  onClose,
  onChanged,
}: CompetitorDialogProps) {
  const { t } = useTranslation(["research", "app"]);
  const queryClient = useQueryClient();
  const key = competitorsKey(validationId);
  const [confirming, setConfirming] = useState(false);

  const writeBack = (patch: Partial<Competitor>) =>
    queryClient.setQueryData<CompetitorsData>(key, (old) =>
      old
        ? {
            ...old,
            items: old.items.map((c) => (c.id === competitor.id ? { ...c, ...patch } : c)),
          }
        : old,
    );

  const editor = useRowEditor<Competitor>({
    row: competitor,
    specs,
    itemKey: `competitor:${competitor.id}`,
    url: `/api/v1/competitors/${competitor.id}`,
    isReadOnly: !canEdit,
    onSaved: (saved) => {
      writeBack(saved);
      onChanged();
    },
    onSentElsewhere: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  const name = String(editor.draft.name ?? "").trim() || competitor.name;
  return (
    <>
      <Dialog
        isOpen
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={name}
        closeLabel={t("app:close")}
        size="large"
        actions={<Button onPress={onClose}>{t("research:done")}</Button>}
      >
        <Stack gap="space-300">
          {canEdit ? (
            <ActionMenu
              label={t("research:competitors.menu", { name })}
              size="S"
              onAction={(action) => {
                if (action === "up") onMove("up");
                else if (action === "down") onMove("down");
                else if (action === "delete") setConfirming(true);
              }}
            >
              <MenuItem id="up" isDisabled={isFirst}>
                {t("research:competitors.moveEarlier")}
              </MenuItem>
              <MenuItem id="down" isDisabled={isLast}>
                {t("research:competitors.moveLater")}
              </MenuItem>
              <MenuItem id="delete" variant="negative">
                {t("research:competitors.delete")}
              </MenuItem>
            </ActionMenu>
          ) : null}
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
          <RowEvidence
            validationId={validationId}
            target={{ type: "competitor", id: competitor.id }}
            label={name}
            evidence={competitor.evidence}
            isReadOnly={!canEdit}
            getLockVersion={editor.getLockVersion}
            flush={editor.flush}
            onConflict={() => void queryClient.invalidateQueries({ queryKey: key })}
            onChanged={(result) => {
              editor.acknowledge(result.lockVersion);
              writeBack({
                evidence: result.classification.evidence,
                lockVersion: result.lockVersion,
              });
              onChanged();
            }}
          />
          <RowEditorNotices
            editor={editor}
            specs={specs}
            itemName={t("research:competitors.itemName")}
          />
        </Stack>
      </Dialog>
      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        variant="negative"
        title={t("research:competitors.confirm.title", { name })}
        primaryActionLabel={t("research:competitors.confirm.confirm")}
        cancelLabel={t("app:cancel")}
        // Input still on its way would be saved to a competitor that is gone.
        onPrimaryAction={() => void editor.flush().then(onDelete)}
      >
        <Text>{t("research:competitors.confirm.body")}</Text>
      </AlertDialog>
    </>
  );
}
