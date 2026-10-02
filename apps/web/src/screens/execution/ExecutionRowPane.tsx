import { formatDate } from "@moonx/i18n";
import {
  ActionButton,
  ActionMenu,
  AlertDialog,
  Flex,
  Heading,
  MenuItem,
  Picker,
  PickerItem,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { RowEditorNotices } from "../../components/RowEditorNotices";
import { RowFields } from "../../components/RowFields";
import {
  assignableMembers,
  EXECUTION_KEYS,
  executionItemUrl,
  executionLayout,
  executionSpecs,
  LAUNCH_TIMINGS,
  TIMING_KEY,
} from "../../lib/execution";
import { useWorkspaceMembers } from "../../lib/ideas";
import { formatItemTarget } from "../../lib/panel-target";
import { type ExecutionItem, executionItemsKey } from "../../lib/plans";
import { useRowEditor } from "../../lib/use-row-editor";
import { AssigneeField } from "./AssigneeField";
import { OverdueBadge, StatusBadge } from "./RowContent";

type Rows = { items: ExecutionItem[] };

export interface ExecutionRowPaneProps {
  workspaceId: string;
  planId: string;
  item: ExecutionItem;
  /** An Owner or Member of a plan that is not archived. */
  canEdit: boolean;
  currency: string;
  timeZone: string;
  isFirst: boolean;
  isLast: boolean;
  /** False for Next Actions, which are sorted by deadline and have no place to move to. */
  orderable: boolean;
  /** A saved version's rows are not the live rows, so they have no comments or history of their own. */
  hasPanels: boolean;
  onMove: (direction: "up" | "down") => void;
  /** Called after the person confirmed; the screen sends the request. */
  onDelete: () => void;
  /** Below desktop the detail has the whole width; this returns to the list. */
  onBack?: () => void;
  /** Marks the plan's other screens stale after a change. */
  onChanged: () => void;
}

/**
 * The detail of one execution item, shared by screen 22's right pane and the dialog of screen 21
 * (design-spec 6.13): every column of the original table with autosave, the assignee, the
 * comments and history buttons and the menu (move, delete). A Viewer reads the same fields as text.
 */
export function ExecutionRowPane({
  workspaceId,
  planId,
  item,
  canEdit,
  currency,
  timeZone,
  isFirst,
  isLast,
  orderable,
  hasPanels,
  onMove,
  onDelete,
  onBack,
  onChanged,
}: ExecutionRowPaneProps) {
  const { t } = useTranslation(["execution", "app"]);
  const queryClient = useQueryClient();
  const members = useWorkspaceMembers(workspaceId);
  const key = executionItemsKey(planId, item.type);
  const [confirming, setConfirming] = useState(false);
  const specs = useMemo(() => executionSpecs(t, item.type), [t, item.type]);
  const layout = useMemo(() => executionLayout(item.type), [item.type]);

  const editor = useRowEditor<ExecutionItem>({
    row: item,
    specs,
    itemKey: `execution:${item.id}`,
    url: executionItemUrl(item.id),
    isReadOnly: !canEdit,
    onSaved: (saved) => {
      const before = queryClient
        .getQueryData<Rows>(key)
        ?.items.find((candidate) => candidate.id === saved.id);
      queryClient.setQueryData<Rows>(key, (old) =>
        old
          ? { items: old.items.map((row) => (row.id === saved.id ? { ...row, ...saved } : row)) }
          : old,
      );
      // The server places Next Actions by deadline, Launch rows by bucket and KPIs by Area.
      if (
        before &&
        (before.dueDate !== saved.dueDate ||
          before.launchTiming !== saved.launchTiming ||
          before.kpiArea !== saved.kpiArea)
      ) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onChanged();
    },
    onSentElsewhere: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  const name = String(editor.draft.title ?? "").trim() || item.title;
  const target = formatItemTarget("execution_item", item.id);
  const specOf = (specKey: string) => specs.find((spec) => spec.key === specKey);
  const timing = editor.draft[TIMING_KEY];

  return (
    <Stack gap="space-300">
      {onBack ? (
        <Flex>
          <ActionButton icon={<ArrowLeft />} onPress={onBack}>
            {t("execution:backToList")}
          </ActionButton>
        </Flex>
      ) : null}
      <Flex gap="space-200" justify="between" align="center">
        <Stack gap="space-100">
          <Heading level={2}>{name}</Heading>
          <Flex gap="space-100" align="center" wrap>
            <StatusBadge status={item.status} />
            {item.overdue ? <OverdueBadge /> : null}
          </Flex>
        </Stack>
        <Flex gap="space-50" align="center">
          {hasPanels ? <ItemPanelButtons target={target} commentCount={item.commentCount} /> : null}
          {canEdit ? (
            <ActionMenu
              label={t("execution:rowMenu", { name })}
              size="S"
              onAction={(action) => {
                if (action === "up") onMove("up");
                else if (action === "down") onMove("down");
                else if (action === "delete") setConfirming(true);
              }}
            >
              {orderable ? (
                <MenuItem id="up" isDisabled={isFirst}>
                  {t("execution:moveUp")}
                </MenuItem>
              ) : null}
              {orderable ? (
                <MenuItem id="down" isDisabled={isLast}>
                  {t("execution:moveDown")}
                </MenuItem>
              ) : null}
              <MenuItem id="delete" variant="negative">
                {t("execution:delete")}
              </MenuItem>
            </ActionMenu>
          ) : null}
        </Flex>
      </Flex>
      {layout.map((part, index) => {
        const partKey = `${part.part}:${index}`;
        if (part.part === "assignee") {
          return (
            <AssigneeField
              key={`${partKey}:${editor.revision}`}
              assignee={item.assignee}
              members={assignableMembers(members.data?.items)}
              isReadOnly={!canEdit}
              onSave={(body, options) => editor.item.save(body, options)}
              onBlur={() => void editor.flush()}
            />
          );
        }
        if (part.part === "timing") {
          const spec = specOf(TIMING_KEY);
          if (spec?.kind !== "choice") return null;
          return canEdit ? (
            <Picker
              key={partKey}
              label={spec.label}
              value={typeof timing === "string" ? timing : "other"}
              onChange={(next) => next && editor.change(TIMING_KEY, next, { immediate: true })}
            >
              {LAUNCH_TIMINGS.map((id) => (
                <PickerItem key={id} id={id}>
                  {t(EXECUTION_KEYS.timing[id])}
                </PickerItem>
              ))}
            </Picker>
          ) : (
            <Stack key={partKey} gap="space-50">
              <Text variant="caption" tone="secondary">
                {spec.label}
              </Text>
              <Text variant="body-long">
                {t(EXECUTION_KEYS.timing[item.launchTiming ?? "other"])}
              </Text>
            </Stack>
          );
        }
        return (
          <RowFields
            key={partKey}
            specs={part.keys.flatMap((specKey) => specOf(specKey) ?? [])}
            values={editor.draft}
            revision={editor.revision}
            problems={editor.problems}
            isReadOnly={!canEdit}
            currency={currency}
            timeZone={timeZone}
            onChange={editor.change}
            onBlur={() => void editor.flush()}
          />
        );
      })}
      {item.type === "kpi" && item.kpiActualUpdatedAt ? (
        <Text variant="caption" tone="secondary">
          {t("execution:kpi.actualUpdated", {
            date: formatDate(item.kpiActualUpdatedAt, timeZone),
          })}
        </Text>
      ) : null}
      <RowEditorNotices editor={editor} specs={specs} itemName={t("execution:itemName")} />
      <AlertDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        variant="negative"
        title={t("execution:confirm.title", { name })}
        primaryActionLabel={t("execution:delete")}
        cancelLabel={t("app:cancel")}
        // Input still on its way would be saved to a row that is gone.
        onPrimaryAction={() => void editor.flush().then(onDelete)}
      >
        <Text>{t("execution:confirm.body")}</Text>
      </AlertDialog>
    </Stack>
  );
}
