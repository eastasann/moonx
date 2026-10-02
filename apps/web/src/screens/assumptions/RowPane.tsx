import type { Assumption, Risk } from "@moonx/schemas";
import {
  ActionButton,
  ActionMenu,
  AlertDialog,
  Flex,
  Heading,
  MenuItem,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { RowEditorNotices } from "../../components/RowEditorNotices";
import { RowEvidence } from "../../components/RowEvidence";
import { RowFields } from "../../components/RowFields";
import { formatItemTarget } from "../../lib/panel-target";
import type { FieldSpec } from "../../lib/row-fields";
import { useRowEditor } from "../../lib/use-row-editor";
import { assumptionsKey, risksKey } from "../../lib/validation-keys";

type Rows = { items: (Assumption | Risk)[] };

export interface RowPaneProps {
  validationId: string;
  /** Which list the row is in: an assumption has evidence, a risk is placed by Impact. */
  kind: "assumption" | "risk";
  row: Assumption | Risk;
  specs: readonly FieldSpec[];
  canEdit: boolean;
  currency: string;
  timeZone: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: "up" | "down") => void;
  /** Called after the person confirmed; the screen sends the request. */
  onDelete: () => void;
  /** Below desktop the detail has the whole width; this returns to the list. */
  onBack?: () => void;
  /** Marks 13 and 6 stale after a change. */
  onChanged: () => void;
}

/**
 * The right pane of 16 for one assumption or risk (design-spec 6.10): its fields with autosave,
 * the evidence of an assumption, the comments and history buttons and the row's menu (move,
 * delete). A Viewer reads the same fields as text.
 */
export function RowPane({
  validationId,
  kind,
  row,
  specs,
  canEdit,
  currency,
  timeZone,
  isFirst,
  isLast,
  onMove,
  onDelete,
  onBack,
  onChanged,
}: RowPaneProps) {
  const { t } = useTranslation(["research", "app"]);
  const queryClient = useQueryClient();
  const isRisk = kind === "risk";
  const key = isRisk ? risksKey(validationId) : assumptionsKey(validationId);
  const [confirming, setConfirming] = useState(false);

  const writeBack = (patch: Partial<Assumption> | Partial<Risk>) =>
    queryClient.setQueryData<Rows>(key, (old) =>
      old
        ? { items: old.items.map((r) => (r.id === row.id ? ({ ...r, ...patch } as typeof r) : r)) }
        : old,
    );

  const editor = useRowEditor<Assumption | Risk>({
    row,
    specs,
    itemKey: `${kind}:${row.id}`,
    url: isRisk ? `/api/v1/risks/${row.id}` : `/api/v1/assumptions/${row.id}`,
    isReadOnly: !canEdit,
    onSaved: (saved) => {
      writeBack(saved);
      // The server places a risk by Impact and Probability, so a change to either moves it.
      if (isRisk) void queryClient.invalidateQueries({ queryKey: key });
      onChanged();
    },
    onSentElsewhere: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  const name = String(editor.draft.statement ?? "").trim() || row.statement;
  const target = formatItemTarget(kind, row.id);
  return (
    <Stack gap="space-300">
      {onBack ? (
        <Flex>
          <ActionButton icon={<ArrowLeft />} onPress={onBack}>
            {isRisk ? t("research:risks.backToList") : t("research:assumptions.backToList")}
          </ActionButton>
        </Flex>
      ) : null}
      <Flex gap="space-200" justify="between" align="center">
        <Heading level={2}>{name}</Heading>
        <Flex gap="space-50" align="center">
          <ItemPanelButtons target={target} commentCount={row.commentCount} />
          {canEdit ? (
            <ActionMenu
              label={t("research:rowMenu", { name })}
              size="S"
              onAction={(action) => {
                if (action === "up") onMove("up");
                else if (action === "down") onMove("down");
                else if (action === "delete") setConfirming(true);
              }}
            >
              <MenuItem id="up" isDisabled={isFirst}>
                {t("research:moveUp")}
              </MenuItem>
              <MenuItem id="down" isDisabled={isLast}>
                {t("research:moveDown")}
              </MenuItem>
              <MenuItem id="delete" variant="negative">
                {t("research:delete")}
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
      {"evidence" in row ? (
        <RowEvidence
          validationId={validationId}
          target={{ type: "assumption", id: row.id }}
          label={name}
          evidence={row.evidence}
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
      ) : null}
      <RowEditorNotices
        editor={editor}
        specs={specs}
        itemName={isRisk ? t("research:risks.itemName") : t("research:assumptions.itemName")}
      />
      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        variant="negative"
        title={
          isRisk
            ? t("research:risks.confirm.title", { name })
            : t("research:assumptions.confirm.title", { name })
        }
        primaryActionLabel={t("research:delete")}
        cancelLabel={t("app:cancel")}
        // Input still on its way would be saved to a row that is gone.
        onPrimaryAction={() => void editor.flush().then(onDelete)}
      >
        <Text>{t("research:confirmBody")}</Text>
      </AlertDialog>
    </Stack>
  );
}
