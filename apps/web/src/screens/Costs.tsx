import { hasText } from "@moonx/domain";
import {
  formatCount,
  formatInputNumber,
  formatInputPercent,
  formatMoney,
  i18n,
} from "@moonx/i18n";
import {
  type CanReduce,
  type CostCategory,
  type CostItem,
  canReduceSchema,
  costCategorySchema,
  costRowNameSchema,
  type costsSchema,
  type EconomicsResult,
  longTextSchema,
  moneySchema,
  numberTextSchema,
  percentInputSchema,
  percentToRate,
  rateToPercent,
  type ValidationHome,
} from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Badge,
  Breadcrumb,
  Breadcrumbs,
  Button,
  CommentCount,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  type FauChange,
  FauPicker,
  Flex,
  Heading,
  InlineAlert,
  Link,
  MenuItem,
  MetricGroup,
  MetricTile,
  MoonGlyph,
  NumberField,
  Picker,
  Skeleton,
  Stack,
  type TableColumn,
  TableView,
  Text,
  TextArea,
  TextField,
  useFauLabel,
  useIsNarrow,
  WorksheetPattern,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { moonOf } from "../components/AnswerFields";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import { ModalBoundary } from "../components/ErrorBoundary";
import { EvidenceSheet } from "../components/EvidenceSheet";
import { toastFailure } from "../components/ideaActions";
import { ReorderDialog } from "../components/ReorderDialog";
import { type RowFieldsSpec, useRowFields } from "../components/RowFields";
import { SaveFailureNote } from "../components/SaveFeedback";
import { SectionTitle } from "../components/SectionTitle";
import {
  FailureState,
  NoAccessState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import {
  type CostRowView,
  costKey,
  settleUnknown,
  useWorksheet,
} from "../components/worksheet";
import {
  dashboardHref,
  useModal,
  usePanel,
  useWorkspace,
} from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import type { SaveFields, SaveTarget } from "../lib/autosave";
import { useAutosave } from "../lib/autosave-react";
import { inputIssueMessage } from "../lib/input-issues";
import { rowLabel } from "../lib/item-labels";
import {
  type CostsSearch,
  economicsHref,
  ideaHref,
  ideasHref,
} from "../lib/links";
import { costGapText, costTotalText, metricText } from "../lib/metrics";
import { useIsOnline } from "../lib/online";
import {
  costsQuery,
  ideaKey,
  putSaved,
  validationHomeQuery,
  workspaceKey,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

export type { CostsSearch };

type CostList = z.infer<typeof costsSchema>;
type CostListKey = ReturnType<typeof costsQuery>["queryKey"];

/** The three tables in the order 17 shows them (design-spec 6.3「表と列」). */
const CATEGORIES = costCategorySchema.options;

/** M2's `about` for a cost row (SDD 4章). */
const aboutOf = (costItemId: string) => `cost_item:${costItemId}`;

/** The element of a table, which `?tab=` brings into view. */
const tableId = (category: CostCategory) => `costs-${category}`;

/** Puts a cost row, as saved, in 17's list: in its place, or last when it is new. */
function putCostRow(
  queryClient: QueryClient,
  listKey: CostListKey,
  row: Partial<CostItem> & { id: string },
) {
  putSaved<CostList>(queryClient, listKey, (data) => {
    if (data === undefined) return undefined;
    const isListed = data.items.some(({ id }) => id === row.id);
    return {
      ...data,
      items: isListed
        ? data.items.map((current) =>
            current.id === row.id ? { ...current, ...row } : current,
          )
        : [...data.items, row as CostItem],
    };
  });
}

/**
 * What else reads the costs: 13's totals and checks, 18 and 19, and the workspace's
 * lists of ideas. Marked out of date, read again when next shown.
 */
function markCostsRead(
  queryClient: QueryClient,
  ideaId: string,
  workspaceId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ideaKey(ideaId),
    refetchType: "none",
  });
  void queryClient.invalidateQueries({
    queryKey: workspaceKey(workspaceId),
    refetchType: "none",
  });
}

/** The save of a cost row's fields (V14 PATCH). */
function costTarget(
  queryClient: QueryClient,
  ideaId: string,
  workspaceId: string,
  listKey: CostListKey,
  costItemId: string,
  noun: string,
): SaveTarget {
  return {
    key: costKey(costItemId),
    noun,
    send: async (fields, lockVersion, force) => {
      const row = await unwrap(
        api()
          .api.v1["cost-items"]({ costItemId: inPath(costItemId) })
          .patch({
            ...settleUnknown(fields, ["amount", "percent"]),
            lockVersion,
            ...(force ? { force } : {}),
          }),
      );
      putCostRow(queryClient, listKey, row);
      markCostsRead(queryClient, ideaId, workspaceId);
      return row.lockVersion;
    },
    // Their version carries the evidence by id only (the history's shape): the list is
    // read again for the whole row.
    loadTheirs: () => void queryClient.invalidateQueries({ queryKey: listKey }),
  };
}

/** A cost row as its fields hold it (design-spec 6.3・6.0.8). */
interface CostValues {
  name: string;
  /** The amount as typed ("1,500.50"), blank for none. */
  amount: string;
  /** The % of the price as typed ("35"), blank for none. */
  percent: string;
  whyNeeded: string;
  canReduce: CanReduce | null;
  notes: string;
}

const amountSchema = numberTextSchema(moneySchema);
const percentSchema = numberTextSchema(percentInputSchema);

/** The fields as a saved row fills them: blank for what it does not hold. */
const costValues = (row: CostItem): CostValues => ({
  name: row.name,
  amount: row.amount === null ? "" : formatInputNumber(row.amount),
  percent:
    row.percent === null ? "" : formatInputNumber(rateToPercent(row.percent)),
  whyNeeded: row.whyNeeded ?? "",
  canReduce: row.canReduce,
  notes: row.notes ?? "",
});

const isBlank = (value: unknown) =>
  typeof value === "string" && value.trim() === "";

/**
 * The fields' rules and how they travel (6.0.8, SDD 5.7 V14).
 */
const costSpec: RowFieldsSpec<CostValues> = {
  errorOf: (field, value) => {
    const result = (() => {
      switch (field) {
        case "name":
          return costRowNameSchema.safeParse(value);
        case "amount":
          return isBlank(value)
            ? { success: true as const }
            : amountSchema.safeParse(value);
        case "percent":
          return isBlank(value)
            ? { success: true as const }
            : percentSchema.safeParse(value);
        case "canReduce":
          return canReduceSchema.nullable().safeParse(value);
        default:
          return longTextSchema.safeParse(value);
      }
    })();
    const [issue] = result.success ? [] : result.error.issues;
    return issue === undefined ? undefined : inputIssueMessage(issue);
  },
  toWire: (field, value) => {
    if (field === "amount") {
      return isBlank(value) ? null : amountSchema.parse(value);
    }
    if (field === "percent") {
      return isBlank(value) ? null : percentToRate(percentSchema.parse(value));
    }
    return value;
  },
  fromWire: (field, value) => {
    if (field === "amount") {
      return (
        typeof value === "number" ? formatInputNumber(value) : ""
      ) as never;
    }
    if (field === "percent") {
      return (
        typeof value === "number" ? formatInputNumber(rateToPercent(value)) : ""
      ) as never;
    }
    if (field === "canReduce") return (value ?? null) as never;
    return (value ?? "") as never;
  },
  isChoice: (field) => field === "canReduce",
};

/** The value column of a row's input mode. */
const valueField = (view: CostRowView) =>
  view.inputMode === "amount" ? "amount" : "percent";

/**
 * The columns of each table (design-spec 6.3「表と列」, s17-costs.html's colgroups). Can
 * Reduce? takes 112px, for its picker to show "Partly" while the row is edited, from the
 * name's share (31% in s17), the same in the three tables so their columns line up.
 */
function useColumns(): Record<CostCategory, TableColumn[]> {
  const { t } = useTranslation(["validation"]);
  const column = (id: string) => t(`validation:costs.column.${id}` as never);
  const head: TableColumn[] = [
    { id: "mark", name: column("mark"), isMark: true },
    { id: "name", name: column("name"), isRowHeader: true, width: "29%" },
  ];
  const more: TableColumn = {
    id: "more",
    name: column("more"),
    isRowActions: true,
  };
  return {
    initial: [
      ...head,
      { id: "amount", name: column("amount"), numeric: true, width: 120 },
      { id: "fau", name: column("fau"), width: 178, isBelowName: true },
      { id: "whyNeeded", name: column("whyNeeded"), isHiddenOnPhone: true },
      {
        id: "canReduce",
        name: column("canReduce"),
        width: 112,
        isHiddenOnPhone: true,
      },
      more,
    ],
    monthly_fixed: [
      ...head,
      { id: "amount", name: column("amount"), numeric: true, width: 120 },
      { id: "fau", name: column("fau"), width: 178, isBelowName: true },
      { id: "notes", name: column("notes"), isHiddenOnPhone: true },
      more,
    ],
    variable: [
      ...head,
      { id: "amount", name: column("amount"), numeric: true, width: 170 },
      { id: "fau", name: column("fau"), isBelowName: true },
      more,
    ],
  };
}

/** A row's name, or "Untitled" for a row whose name is left empty (6.0.8). */
function useNameOf() {
  const { t } = useTranslation(["common"]);
  return (view: CostRowView) =>
    hasText(view.name) ? view.name : t("common:itemLabel.untitled");
}

/** An amount as 17 shows it: cents for variable costs and for amounts that have them. */
const amountText = (view: CostRowView, amount: number, currency: string) =>
  formatMoney(amount, currency, {
    cents: view.row.category === "variable" || !Number.isInteger(amount),
  });

/**
 * A row's value (design-spec 6.3): its amount, or its % of the price with what that comes
 * to ("35% · ₱77.00", or "Needs price"); "Unknown" or "Empty" when it has none.
 */
function ValueText({
  view,
  price,
}: {
  view: CostRowView;
  /** 18's price as it shows; null while it has none. */
  price: number | null;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  if (view.amount !== null) {
    return <>{amountText(view, view.amount, workspace.currency)}</>;
  }
  if (view.percent !== null) {
    return (
      <>
        {formatInputPercent(view.percent)}{" "}
        <Text variant="number-sm" tone="secondary">
          {t("validation:costs.percentAmount", {
            amount:
              price === null
                ? t("common:metricReason.needs_price")
                : formatMoney(price * view.percent, workspace.currency, {
                    cents: true,
                  }),
          })}
        </Text>
      </>
    );
  }
  return (
    <Text variant="number" tone="tertiary">
      {t(`common:fauState.${view.state === "unknown" ? "unknown" : "empty"}`)}
    </Text>
  );
}

/** One field of a row being edited in place (design-spec 4.5 TableView). */
function CostField({
  view,
  field,
  target,
}: {
  view: CostRowView;
  field: keyof CostValues;
  target: SaveTarget;
}) {
  const { t } = useTranslation(["validation"]);
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const nameOf = useNameOf();
  const fields = useRowFields<CostValues>(
    target,
    view.row.lockVersion,
    costValues(view.row),
    costSpec,
  );
  const name = nameOf(view);
  const common = {
    errorMessage: fields.errors[field],
    onBlur: () => fields.blur(field),
    isReadOnly: !isOnline,
    width: "full" as const,
  };
  switch (field) {
    case "name":
      return (
        <TextField
          {...common}
          aria-label={t("validation:costs.label.name", { name })}
          value={fields.values.name}
          onChange={(value) => fields.change("name", value)}
        />
      );
    case "amount":
      return (
        <NumberField
          {...common}
          aria-label={t("validation:costs.label.amount", { name })}
          currency={workspace.currency}
          value={fields.values.amount}
          onChange={(value) => fields.change("amount", value)}
        />
      );
    case "percent":
      return (
        <NumberField
          {...common}
          aria-label={t("validation:costs.label.percent", { name })}
          isPercent
          value={fields.values.percent}
          onChange={(value) => fields.change("percent", value)}
        />
      );
    case "canReduce":
      return (
        <CanReducePicker
          name={name}
          value={fields.values.canReduce}
          isDisabled={!isOnline}
          onChange={(value) => fields.change("canReduce", value)}
        />
      );
    default:
      return (
        <TextField
          {...common}
          aria-label={t(`validation:costs.label.${field}`, { name })}
          value={fields.values[field]}
          onChange={(value) => fields.change(field, value)}
        />
      );
  }
}

/** The Can Reduce? picker's item for none: a row need not say (6.0.8). */
const NOT_SET = "none";

function CanReducePicker({
  name,
  value,
  isDisabled,
  label,
  onChange,
}: {
  name: string;
  value: CanReduce | null;
  isDisabled: boolean;
  /** Its visible label, in the phone's sheet; the table's column names it there. */
  label?: string;
  onChange: (value: CanReduce | null) => void;
}) {
  const { t } = useTranslation(["validation"]);
  // None shows as the dash the row shows for it, which fits the column, and is read as
  // what it means.
  const items = [
    {
      id: NOT_SET,
      label: t("validation:costs.none"),
      spokenLabel: t("validation:costs.canReduce.none"),
    },
    ...canReduceSchema.options.map((option) => ({
      id: option,
      label: t(`validation:costs.canReduce.${option}`),
    })),
  ];
  return (
    <Picker
      {...(label === undefined
        ? { "aria-label": t("validation:costs.label.canReduce", { name }) }
        : { label })}
      items={items}
      value={value ?? NOT_SET}
      onChange={(key) =>
        onChange(
          key === null || key === NOT_SET ? null : canReduceSchema.parse(key),
        )
      }
      isDisabled={isDisabled}
      width="full"
    />
  );
}

/** The ⋯ of a row (design-spec 6.3「操作」, 6.0.4): its id names the action. */
type RowAction =
  | "comments"
  | "history"
  | "rename"
  | "mode"
  | "lump"
  | "reorder"
  | "delete";

/**
 * A row's ⋯: Comments and History for everyone who reads the row (design-spec 6.0.4・
 * 6.0.5), then the Owners' and Members' actions.
 */
function RowMenu({
  view,
  canEdit,
  isInSheet = false,
  onAction,
}: {
  view: CostRowView;
  canEdit: boolean;
  /** In the phone's sheet the name is a field already: no Rename. */
  isInSheet?: boolean;
  onAction: (action: RowAction) => void;
}) {
  const { t } = useTranslation(["validation", "panels"]);
  const nameOf = useNameOf();
  // Offline, nothing can be sent (design-spec 6.0.6「オフライン」); the comments read
  // so far still open.
  const isOnline = useIsOnline();
  return (
    <ActionMenu
      size="S"
      disabledKeys={
        isOnline ? [] : ["rename", "mode", "lump", "reorder", "delete"]
      }
      aria-label={t("validation:costs.more", { name: nameOf(view) })}
      onAction={(key) => onAction(String(key) as RowAction)}
    >
      <MenuItem id="comments">
        {view.row.commentCount > 0
          ? t("panels:comments.menuCount", {
              formatted: formatCount(view.row.commentCount),
            })
          : t("panels:comments.menu")}
      </MenuItem>
      <MenuItem id="history">{t("panels:history.menu")}</MenuItem>
      {canEdit && !isInSheet && (
        <MenuItem id="rename">{t("validation:costs.menu.rename")}</MenuItem>
      )}
      {canEdit && view.row.category === "variable" && (
        <MenuItem id="mode">
          {view.inputMode === "amount"
            ? t("validation:costs.menu.usePercent")
            : t("validation:costs.menu.useAmount")}
        </MenuItem>
      )}
      {canEdit && (
        <MenuItem id="lump">
          {view.isLumpSum
            ? t("validation:costs.menu.unmarkLumpSum")
            : t("validation:costs.menu.markLumpSum")}
        </MenuItem>
      )}
      {canEdit && (
        <MenuItem id="reorder">{t("validation:costs.menu.reorder")}</MenuItem>
      )}
      {canEdit && (
        <MenuItem id="delete">{t("validation:costs.menu.delete")}</MenuItem>
      )}
    </ActionMenu>
  );
}

/**
 * A row in a phone's sheet (design-spec 6.3: the row's press opens it; every field, the
 * F/A/U buttons and the row's ⋯ in it). A Viewer and an archived idea read it.
 */
function CostRowSheet({
  view,
  target,
  price,
  canEdit,
  onFau,
  onFact,
  onAction,
  onClose,
}: {
  view: CostRowView;
  target: SaveTarget;
  price: number | null;
  canEdit: boolean;
  onFau: (change: FauChange) => void;
  onFact: () => void;
  onAction: (action: RowAction) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  const nameOf = useNameOf();
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      size="M"
      title={canEdit ? t("validation:costs.editTitle") : nameOf(view)}
    >
      {canEdit ? (
        <CostRowEditor
          view={view}
          target={target}
          price={price}
          onFau={onFau}
          onFact={onFact}
          onAction={onAction}
        />
      ) : (
        <CostRowFacts view={view} price={price} onAction={onAction} />
      )}
    </Dialog>
  );
}

function CostRowEditor({
  view,
  target,
  price,
  onFau,
  onFact,
  onAction,
}: {
  view: CostRowView;
  target: SaveTarget;
  price: number | null;
  onFau: (change: FauChange) => void;
  onFact: () => void;
  onAction: (action: RowAction) => void;
}) {
  const { t } = useTranslation(["validation"]);
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const nameOf = useNameOf();
  const fields = useRowFields<CostValues>(
    target,
    view.row.lockVersion,
    costValues(view.row),
    costSpec,
  );
  const name = nameOf(view);
  const text = (field: "whyNeeded" | "notes") => (
    <TextArea
      label={t(`validation:costs.field.${field}`)}
      value={fields.values[field]}
      onChange={(value) => fields.change(field, value)}
      onBlur={() => fields.blur(field)}
      errorMessage={fields.errors[field]}
      isReadOnly={!isOnline}
      width="full"
    />
  );
  const byPercent = view.inputMode === "percent_of_price";
  return (
    <Stack gap="space-300">
      <Flex justifyContent="end">
        <RowMenu view={view} canEdit isInSheet onAction={onAction} />
      </Flex>
      <SaveFailureNote itemKey={target.key} />
      <TextField
        label={t("validation:costs.field.name")}
        value={fields.values.name}
        onChange={(value) => fields.change("name", value)}
        onBlur={() => fields.blur("name")}
        errorMessage={fields.errors.name}
        isReadOnly={!isOnline}
        width="full"
        autoFocus
      />
      <NumberField
        label={t(`validation:costs.field.${byPercent ? "percent" : "amount"}`)}
        {...(byPercent
          ? { isPercent: true }
          : { currency: workspace.currency })}
        value={byPercent ? fields.values.percent : fields.values.amount}
        onChange={(value) =>
          fields.change(byPercent ? "percent" : "amount", value)
        }
        onBlur={() => fields.blur(byPercent ? "percent" : "amount")}
        errorMessage={fields.errors[byPercent ? "percent" : "amount"]}
        description={
          byPercent && view.percent !== null ? (
            <ValueText view={view} price={price} />
          ) : undefined
        }
        isReadOnly={!isOnline}
        width="full"
      />
      <FauPicker
        aria-label={t("validation:costs.label.fau", { name })}
        state={view.state}
        confidence={view.confidence}
        evidenceCount={view.counted}
        hasValue={view.hasValue}
        isReadOnly={!isOnline}
        onChange={onFau}
        onFactPress={onFact}
      />
      {view.row.category === "initial" && (
        <>
          {text("whyNeeded")}
          <CanReducePicker
            name={name}
            label={t("validation:costs.field.canReduce")}
            value={fields.values.canReduce}
            isDisabled={!isOnline}
            onChange={(value) => fields.change("canReduce", value)}
          />
        </>
      )}
      {view.row.category === "monthly_fixed" && text("notes")}
    </Stack>
  );
}

/**
 * A row to read in the phone's sheet (a Viewer, an archived idea), with its ⋯ for its
 * comments.
 */
function CostRowFacts({
  view,
  price,
  onAction,
}: {
  view: CostRowView;
  price: number | null;
  onAction: (action: RowAction) => void;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const fauLabel = useFauLabel();
  const empty = <Text tone="secondary">{t("validation:rows.empty")}</Text>;
  const text = (value: string | null) => (hasText(value) ? value : empty);
  return (
    <Stack gap="space-300">
      <Flex justifyContent="end">
        <RowMenu view={view} canEdit={false} isInSheet onAction={onAction} />
      </Flex>
      <DescriptionList>
        <DescriptionListItem
          label={t(
            `validation:costs.field.${view.inputMode === "amount" ? "amount" : "percent"}`,
          )}
        >
          <ValueText view={view} price={price} />
        </DescriptionListItem>
        <DescriptionListItem label={t("validation:costs.column.fau")}>
          <Flex gap="space-75" alignItems="center">
            <MoonGlyph state={moonOf[view.state]} size="S" />
            {fauLabel(view.state, {
              confidence: view.confidence,
              evidenceCount: view.counted,
            })}
          </Flex>
        </DescriptionListItem>
        {view.row.category === "initial" && (
          <>
            <DescriptionListItem label={t("validation:costs.field.whyNeeded")}>
              {text(view.whyNeeded)}
            </DescriptionListItem>
            <DescriptionListItem label={t("validation:costs.field.canReduce")}>
              {view.canReduce === null
                ? empty
                : t(`validation:costs.canReduce.${view.canReduce}`)}
            </DescriptionListItem>
          </>
        )}
        {view.row.category === "monthly_fixed" && (
          <DescriptionListItem label={t("validation:costs.field.notes")}>
            {text(view.notes)}
          </DescriptionListItem>
        )}
      </DescriptionList>
    </Stack>
  );
}

/** The question before a row is deleted (design-spec 6.3: it comes back from history). */
function DeleteCostQuestion({
  onDelete,
  onClose,
}: {
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  return (
    <AlertDialog
      isOpen
      variant="destructive"
      size="S"
      title={t("validation:costs.deleteTitle")}
      primaryActionLabel={t("validation:costs.delete")}
      cancelLabel={t("validation:costs.cancel")}
      autoFocusButton="cancel"
      onPrimaryAction={() => {
        onClose();
        onDelete();
      }}
      onCancel={onClose}
    >
      {t("validation:rows.deleteBody")}
    </AlertDialog>
  );
}

/**
 * The question before a variable row with a value changes how it is entered: the API
 * clears the value of the mode left, and its Fact or Assumption with it (SDD 5.7 V14).
 */
function SwitchModeQuestion({
  view,
  onSwitch,
  onClose,
}: {
  view: CostRowView;
  onSwitch: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  const { workspace } = useWorkspace();
  const nameOf = useNameOf();
  const next = view.inputMode === "amount" ? "percent_of_price" : "amount";
  const value =
    view.amount !== null
      ? amountText(view, view.amount, workspace.currency)
      : view.percent !== null
        ? formatInputPercent(view.percent)
        : "";
  return (
    <AlertDialog
      isOpen
      variant="confirmation"
      size="S"
      title={t(`validation:costs.switchTitle.${next}`, { name: nameOf(view) })}
      primaryActionLabel={t("validation:costs.switch")}
      cancelLabel={t("validation:costs.cancel")}
      autoFocusButton="cancel"
      onPrimaryAction={() => {
        onClose();
        onSwitch();
      }}
      onCancel={onClose}
    >
      {t("validation:costs.switchBody", { value })}
    </AlertDialog>
  );
}

/** A table's total and what it leaves out (design-spec 6.3「合計の出し方」). */
function totalOf(
  category: CostCategory,
  result: EconomicsResult,
  currency: string,
): { value: string; gaps: string | null } {
  const total =
    category === "initial"
      ? result.totals.initial
      : category === "monthly_fixed"
        ? result.totals.monthlyFixed
        : result.totals.variablePerUnit;
  const value =
    category === "variable" &&
    result.variableCostPerUnit.reason === "needs_price"
      ? i18n.t("common:metricReason.needs_price")
      : costTotalText(total, currency, { cents: category === "variable" });
  return { value, gaps: costGapText(total) };
}

/**
 * The Totals (design-spec 6.3, s17-costs.html .tot): startup, monthly fixed and variable
 * per sale, each a lower bound while a row is Empty or Unknown, and 18's break-even per
 * day, with the way to 18.
 */
function Totals({
  ideaId,
  result,
  price,
}: {
  ideaId: string;
  result: EconomicsResult;
  price: number | null;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  const { currency } = workspace;
  const lowerBound = (total: EconomicsResult["totals"]["initial"]) => {
    const gaps = costGapText(total);
    return total.amount !== null && gaps !== null
      ? t("validation:costs.lowerBound", { gaps })
      : undefined;
  };
  const table = (
    label: string,
    total: EconomicsResult["totals"]["initial"],
    options: { cents?: boolean; unit?: string } = {},
  ) => (
    <MetricTile
      label={label}
      value={costTotalText(total, currency, options)}
      unit={total.amount === null ? undefined : options.unit}
      isPlaceholder={total.amount === null}
      supplement={lowerBound(total)}
    />
  );
  const needsPrice = result.variableCostPerUnit.reason === "needs_price";
  const breakEven = result.breakEvenUnitsDay;
  return (
    <Stack gap="space-200">
      <MetricGroup aria-label={t("validation:costs.totals")} variant="column">
        {table(t("validation:costs.total.startup"), result.totals.initial)}
        {table(t("validation:costs.total.monthly"), result.totals.monthlyFixed)}
        {needsPrice ? (
          <MetricTile
            label={t("validation:costs.total.variable")}
            value={t("common:metricReason.needs_price")}
            isPlaceholder
            supplement={
              <Link
                href={economicsHref(workspace.id, ideaId, {
                  field: "selling_price",
                })}
              >
                {t("validation:costs.addPrice")}
              </Link>
            }
          />
        ) : (
          table(
            t("validation:costs.total.variable"),
            result.totals.variablePerUnit,
            {
              cents: true,
              unit: t("validation:costs.perSaleUnit"),
            },
          )
        )}
        <MetricTile
          label={t("validation:costs.total.breakEven")}
          value={metricText(breakEven, "units", currency)}
          unit={
            breakEven.value === null
              ? undefined
              : t("validation:costs.perDayUnit")
          }
          isPlaceholder={breakEven.value === null}
          supplement={
            breakEven.value !== null && price !== null
              ? t("validation:costs.atPrice", {
                  price: formatMoney(price, currency, {
                    cents: !Number.isInteger(price),
                  }),
                })
              : undefined
          }
        />
      </MetricGroup>
      <Flex>
        <Link href={economicsHref(workspace.id, ideaId)}>
          <Flex gap="space-50" alignItems="center">
            {t("validation:costs.toEconomics")}
            <ArrowRight aria-hidden size={14} />
          </Flex>
        </Link>
      </Flex>
    </Stack>
  );
}

/** The summary bar's pairs (design-spec 6.3): "Startup ₱450,000+ · Monthly ₱49,000 · BE 13+/day". */
function TotalsSummary({ result }: { result: EconomicsResult }) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  const pairs: [string, string, string][] = [
    [
      t("validation:costs.summary.startup"),
      costTotalText(result.totals.initial, workspace.currency),
      "",
    ],
    [
      t("validation:costs.summary.monthly"),
      costTotalText(result.totals.monthlyFixed, workspace.currency),
      "",
    ],
    [
      t("validation:costs.summary.breakEven"),
      metricText(result.breakEvenUnitsDay, "units", workspace.currency),
      result.breakEvenUnitsDay.value === null
        ? ""
        : t("validation:costs.summary.perDay"),
    ],
  ];
  return (
    <Flex columnGap="space-100" alignItems="baseline" wrap>
      {pairs.map(([label, value, unit]) => (
        <Text key={label} variant="caption" tone="secondary">
          {`${label} `}
          <Text variant="number-sm" tone="primary">
            <strong>{value}</strong>
          </Text>
          {unit}
        </Text>
      ))}
    </Flex>
  );
}

/** The tables' shape while the rows load (design-spec 6.0.6). */
function TablesSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <Stack gap="space-500">
      {CATEGORIES.map((category) => (
        <Stack key={category} gap="space-100">
          <Heading level={2} variant="heading-4">
            {t(`validation:costs.table.${category}`)}
          </Heading>
          {[0, 1, 2, 3].map((row) => (
            <Text key={row}>{t(`validation:costs.table.${category}`)}</Text>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

const NO_ITEMS: CostItem[] = [];
const NO_INPUTS: CostList["economicsInputs"] = [];

function CostsBody({
  home,
  search,
  modal,
  about,
}: {
  home: ValidationHome;
  search: CostsSearch;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["validation", "common", "app"]);
  const { me, workspace, role } = useWorkspace();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const modals = useModal();
  const panel = usePanel();
  const isPhone = useIsNarrow();
  const isOnline = useIsOnline();
  const columns = useColumns();
  const nameOf = useNameOf();
  const forFact = useRouterState({
    select: (state) => state.location.state.evidenceForFact === true,
  });
  const { idea, validationId } = home;
  const canEdit = role !== "viewer" && !idea.archived;
  const list = costsQuery(idea.id, validationId);
  const query = useQuery(list);
  const isSlow = useIsSlow(query.isPending);
  const { rows, numbers, result } = useWorksheet(
    validationId,
    query.data?.items ?? NO_ITEMS,
    query.data?.economicsInputs ?? NO_INPUTS,
  );
  const price =
    numbers.find(({ input }) => input.fieldKey === "selling_price")?.value ??
    null;
  const [sheetRowId, setSheetRowId] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState<{
    key: string;
    columnId: string;
  } | null>(null);
  const [reordering, setReordering] = useState<CostCategory | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  const targetOf = (costItemId: string) =>
    costTarget(
      queryClient,
      idea.id,
      workspace.id,
      list.queryKey,
      costItemId,
      t("validation:costs.noun"),
    );
  /** A choice is saved when made (6.0.2). */
  const choose = (view: CostRowView, fields: SaveFields) => {
    autosave.change(targetOf(view.row.id), view.row.lockVersion, fields);
    autosave.flush(costKey(view.row.id));
  };
  const classify = (view: CostRowView, change: FauChange) =>
    choose(
      view,
      change.fau === "unknown"
        ? {
            classification: { fau: "unknown", confidence: null },
            [valueField(view)]: null,
          }
        : { classification: change },
    );
  const openEvidence = (view: CostRowView, isFact: boolean) =>
    modals.open("evidence", { about: aboutOf(view.row.id), forFact: isFact });
  /** Opens a row to edit: its name or amount in place, its sheet on a phone. */
  const openRow = (costItemId: string, columnId: string) => {
    if (isPhone) setSheetRowId(costItemId);
    else setEditRequest({ key: costItemId, columnId });
  };
  const switchMode = (view: CostRowView) =>
    choose(view, {
      inputMode: view.inputMode === "amount" ? "percent_of_price" : "amount",
      amount: null,
      percent: null,
    });
  const act = (view: CostRowView, action: RowAction) => {
    switch (action) {
      case "comments":
      case "history":
        // The sheet is modal: the thread or the changes open in the panel once it is
        // closed.
        setSheetRowId(null);
        panel.show(action, {
          kind: "item",
          item: { type: "cost_item", id: view.row.id, key: null },
        });
        break;
      case "rename":
        openRow(view.row.id, "name");
        break;
      case "mode":
        if (view.hasValue) setSwitching(view.row.id);
        else switchMode(view);
        break;
      case "lump":
        choose(view, { isLumpSum: !view.isLumpSum });
        break;
      case "reorder":
        setSheetRowId(null);
        setReordering(view.row.category);
        break;
      case "delete":
        setDeleting(view.row.id);
        break;
    }
  };

  const add = useMutation({
    mutationFn: (category: CostCategory) =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          ["cost-items"].post({ category, name: "" }),
      ),
    onSuccess: (row) => {
      putCostRow(queryClient, list.queryKey, row);
      markCostsRead(queryClient, idea.id, workspace.id);
      openRow(row.id, "name");
    },
    onError: (error, category) =>
      toastFailure(error, () => add.mutate(category)),
  });

  // Whether 17 is still open when a delete settles, which may be later.
  const isOpen = useRef(true);
  useEffect(() => {
    isOpen.current = true;
    return () => {
      isOpen.current = false;
    };
  }, []);
  const remove = useMutation({
    mutationFn: (costItemId: string) =>
      unwrap(
        api()
          .api.v1["cost-items"]({ costItemId: inPath(costItemId) })
          .delete({}),
      ),
    onSettled: (_data, error, costItemId) => {
      // Deleted, here or already elsewhere (V14 answers 404 for a deleted row).
      if (
        error !== null &&
        !(error instanceof ApiError && error.code === "NOT_FOUND")
      ) {
        toastFailure(error, () => remove.mutate(costItemId));
        return;
      }
      putSaved<CostList>(queryClient, list.queryKey, (data) =>
        data === undefined
          ? undefined
          : {
              ...data,
              items: data.items.filter(({ id }) => id !== costItemId),
            },
      );
      markCostsRead(queryClient, idea.id, workspace.id);
      if (isOpen.current) {
        setSheetRowId((current) => (current === costItemId ? null : current));
      }
    },
  });

  // A link to a row (`?row=` its id or its template key) or to a table (`?tab=`) brings
  // it into view once the rows are read: the row is opened at its amount.
  const linked = useRef<string | null>(null);
  const linkKey = `${search.row ?? ""}|${search.tab ?? ""}`;
  useEffect(() => {
    if (query.data === undefined || linked.current === linkKey) return;
    linked.current = linkKey;
    const row =
      search.row === undefined
        ? undefined
        : query.data.items.find(
            ({ id, templateKey }) =>
              id === search.row || templateKey === search.row,
          );
    if (row !== undefined) {
      openRow(row.id, "amount");
      return;
    }
    if (search.tab !== undefined) {
      document
        .getElementById(tableId(search.tab))
        ?.scrollIntoView({ block: "start" });
    }
  });

  // Leaving 17 sends what waits (design-spec 6.0.2「画面を離れるとき」).
  const keys = useRef<string[]>([]);
  keys.current = rows.map((view) => costKey(view.row.id));
  useEffect(
    () => () => {
      for (const key of keys.current) autosave.flush(key);
    },
    [autosave],
  );

  if (query.isError) {
    return (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  }

  const title =
    home.sections.find(({ key }) => key === "05")?.title ??
    t("validation:costs.title");
  const isFresh =
    rows.length > 0 && rows.every((view) => view.state === "empty");
  const header = (
    <Stack gap="space-200">
      {idea.archived && <ArchivedIdeaAlert ideaId={idea.id} />}
      <Flex columnGap="space-300" rowGap="space-100" alignItems="baseline" wrap>
        <SectionTitle ideaId={idea.id} sections={home.sections} title={title} />
        <Text tone="secondary">{t("validation:costs.lead")}</Text>
      </Flex>
      {canEdit && isFresh && (
        <InlineAlert variant="informative">
          {t("validation:costs.fresh")}
        </InlineAlert>
      )}
    </Stack>
  );

  if (query.data === undefined) {
    return isSlow ? (
      <SlowLoadingState onRetry={() => void query.refetch()} />
    ) : (
      <Skeleton isLoading>
        <WorksheetPattern
          header={header}
          inputs={<TablesSkeleton />}
          resultsTitle={t("validation:costs.totals")}
          results={null}
          summary={null}
        />
      </Skeleton>
    );
  }

  const viewOf = (costItemId: string) =>
    rows.find((view) => view.row.id === costItemId);

  const table = (category: CostCategory) => {
    const items = rows
      .filter((view) => view.row.category === category)
      .map((view) => ({ id: view.row.id, view }));
    const title = t(`validation:costs.table.${category}`);
    return (
      <Stack key={category} gap="space-100">
        <div id={tableId(category)}>
          <Flex gap="space-200" alignItems="baseline">
            <Heading level={2} variant="heading-4">
              {title}
            </Heading>
            <Text variant="caption" tone="secondary">
              {t(`validation:costs.unit.${category}`)}
            </Text>
          </Flex>
        </div>
        <TableView
          aria-label={title}
          columns={columns[category]}
          items={items}
          textValue={({ view }) => nameOf(view)}
          isRowEditable={() => canEdit}
          onRowAction={(key) => setSheetRowId(String(key))}
          editRequest={editRequest}
          onEditRequestMet={() => setEditRequest(null)}
          renderEmptyState={() => (
            <Text tone="secondary">{t("validation:costs.noRows")}</Text>
          )}
          footerAction={
            canEdit ? (
              <Button
                variant="secondary"
                isQuiet
                onPress={() => add.mutate(category)}
                isPending={add.isPending && add.variables === category}
                isDisabled={!isOnline}
              >
                <Plus />
                {t("validation:costs.addRow")}
              </Button>
            ) : undefined
          }
          footerTotal={
            <Flex
              columnGap="space-100"
              alignItems="baseline"
              justifyContent="end"
              wrap
            >
              {category === "variable"
                ? t("validation:costs.perSale")
                : t("validation:costs.subtotal")}
              <Text variant="number" tone="primary">
                {totalOf(category, result, workspace.currency).value}
              </Text>
              {totalOf(category, result, workspace.currency).gaps !== null &&
                t("validation:costs.gapNote", {
                  gaps: totalOf(category, result, workspace.currency).gaps,
                })}
            </Flex>
          }
          renderCell={({ view }, column, { isEditing, isCard }) => {
            const name = nameOf(view);
            switch (column) {
              case "mark":
                return <MoonGlyph state={moonOf[view.state]} size="S" />;
              case "name":
                return (
                  <Stack gap="space-75">
                    {isEditing ? (
                      <CostField
                        view={view}
                        field="name"
                        target={targetOf(view.row.id)}
                      />
                    ) : (
                      <Flex gap="space-100" alignItems="center" wrap>
                        {hasText(view.name) ? (
                          view.name
                        ) : (
                          <Text tone="tertiary">{name}</Text>
                        )}
                        {view.isLumpSum && (
                          <Badge>{t("validation:costs.lumpSum")}</Badge>
                        )}
                        {isCard ? (
                          // A phone's row presses as a whole and holds no buttons.
                          <Text variant="caption" tone="secondary">
                            <CommentCount count={view.row.commentCount} />
                          </Text>
                        ) : (
                          view.row.commentCount > 0 && (
                            <ItemCommentsButton
                              label={rowLabel("cost_item", view.name)}
                              count={view.row.commentCount}
                              onPress={() => act(view, "comments")}
                            />
                          )
                        )}
                      </Flex>
                    )}
                    {isEditing && view.isLumpSum && (
                      <Flex>
                        <Badge>{t("validation:costs.lumpSum")}</Badge>
                      </Flex>
                    )}
                    {canEdit && !isCard && (
                      <SaveFailureNote itemKey={costKey(view.row.id)} />
                    )}
                  </Stack>
                );
              case "amount":
                return isEditing ? (
                  <CostField
                    view={view}
                    field={valueField(view)}
                    target={targetOf(view.row.id)}
                  />
                ) : (
                  <ValueText view={view} price={price} />
                );
              case "fau":
                // A phone's Empty row says what pressing it is for, in the place of its
                // F/A/U (s17-costs.html, design-spec 6.3).
                if (isCard && canEdit && view.state === "empty") {
                  return (
                    <Text variant="caption" tone="tertiary">
                      {t("validation:costs.emptyRowHint")}
                    </Text>
                  );
                }
                return (
                  <FauPicker
                    aria-label={t("validation:costs.label.fau", { name })}
                    state={view.state}
                    confidence={view.confidence}
                    evidenceCount={view.counted}
                    hasValue={view.hasValue}
                    isReadOnly={!canEdit || isCard || !isOnline}
                    onChange={(change) => classify(view, change)}
                    onFactPress={() => openEvidence(view, true)}
                  />
                );
              case "whyNeeded":
              case "notes":
                return isEditing ? (
                  <CostField
                    view={view}
                    field={column}
                    target={targetOf(view.row.id)}
                  />
                ) : (
                  <Text variant="body-sm" tone="secondary">
                    {view[column] ?? ""}
                  </Text>
                );
              case "canReduce":
                return isEditing ? (
                  <CostField
                    view={view}
                    field="canReduce"
                    target={targetOf(view.row.id)}
                  />
                ) : view.canReduce === null ? (
                  <Text tone="tertiary">{t("validation:costs.none")}</Text>
                ) : (
                  t(`validation:costs.canReduce.${view.canReduce}`)
                );
              default:
                return (
                  <RowMenu
                    view={view}
                    canEdit={canEdit}
                    onAction={(action) => act(view, action)}
                  />
                );
            }
          }}
        />
      </Stack>
    );
  };

  const sheetView = sheetRowId === null ? undefined : viewOf(sheetRowId);
  const deletingView = deleting === null ? undefined : viewOf(deleting);
  const switchingView = switching === null ? undefined : viewOf(switching);
  const evidenceView =
    modal === "evidence" && canEdit
      ? rows.find((view) => aboutOf(view.row.id) === about)
      : undefined;
  const reorderItems = (category: CostCategory, items: readonly CostItem[]) =>
    items
      .filter((row) => row.category === category)
      .map((row) => ({
        id: row.id,
        label: hasText(row.name) ? row.name : t("common:itemLabel.untitled"),
      }));

  return (
    <>
      <WorksheetPattern
        header={header}
        inputs={
          <Stack gap="space-500">
            {CATEGORIES.map((category) => table(category))}
          </Stack>
        }
        resultsTitle={t("validation:costs.totals")}
        results={<Totals ideaId={idea.id} result={result} price={price} />}
        summary={<TotalsSummary result={result} />}
      />
      {sheetView !== undefined && (
        <CostRowSheet
          view={sheetView}
          target={targetOf(sheetView.row.id)}
          price={price}
          canEdit={canEdit}
          onFau={(change) => classify(sheetView, change)}
          onFact={() => openEvidence(sheetView, true)}
          onAction={(action) => act(sheetView, action)}
          onClose={() => setSheetRowId(null)}
        />
      )}
      {reordering !== null && canEdit && (
        <ReorderDialog
          title={t(`validation:costs.reorderTitle.${reordering}`)}
          items={reorderItems(reordering, query.data.items)}
          send={async (ids) => {
            await unwrap(
              api()
                .api.v1.validations({ validationId: inPath(validationId) })
                ["cost-items"].order.put({ ids, category: reordering }),
            );
            putSaved<CostList>(queryClient, list.queryKey, (data) =>
              data === undefined
                ? undefined
                : {
                    ...data,
                    items: [
                      ...data.items.filter(
                        (row) => row.category !== reordering,
                      ),
                      ...ids.flatMap((id, index) => {
                        const row = data.items.find((item) => item.id === id);
                        return row === undefined
                          ? []
                          : [{ ...row, sortOrder: index }];
                      }),
                    ],
                  },
            );
          }}
          reload={async () =>
            reorderItems(
              reordering,
              (await queryClient.fetchQuery({ ...list, staleTime: 0 })).items,
            )
          }
          onClose={() => setReordering(null)}
        />
      )}
      {deletingView !== undefined && (
        <DeleteCostQuestion
          onDelete={() => remove.mutate(deletingView.row.id)}
          onClose={() => setDeleting(null)}
        />
      )}
      {switchingView !== undefined && (
        <SwitchModeQuestion
          view={switchingView}
          onSwitch={() => switchMode(switchingView)}
          onClose={() => setSwitching(null)}
        />
      )}
      {evidenceView !== undefined && (
        <ModalBoundary key="evidence" onClose={modals.close}>
          <EvidenceSheet
            ideaId={idea.id}
            validationId={validationId}
            item={{
              target: { type: "cost_item", id: evidenceView.row.id, key: null },
              label: t("common:itemLabel.row", {
                list: t("common:itemLabel.list.cost_item"),
                text: nameOf(evidenceView),
              }),
              noun: t("validation:costs.noun"),
              evidence: evidenceView.row.classification.evidence,
              state: evidenceView.state,
              hasValue: evidenceView.hasValue,
            }}
            lockVersionNow={() =>
              queryClient
                .getQueryData(list.queryKey)
                ?.items.find(({ id }) => id === evidenceView.row.id)
                ?.lockVersion ?? evidenceView.row.lockVersion
            }
            saveKey={costKey(evidenceView.row.id)}
            forFact={forFact}
            onChanged={(change) =>
              putCostRow(queryClient, list.queryKey, {
                id: evidenceView.row.id,
                classification: change.classification,
                lockVersion: change.lockVersion,
              })
            }
            onMarkFact={() =>
              classify(evidenceView, { fau: "fact", confidence: null })
            }
            onReload={() =>
              void queryClient.invalidateQueries({ queryKey: list.queryKey })
            }
            onClose={modals.close}
          />
        </ModalBoundary>
      )}
    </>
  );
}

/**
 * 17's shape while its route loads (design-spec 6.0.6). Drawn inside a `Skeleton`, its
 * words are bars.
 */
export function CostsSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <WorksheetPattern
      header={<Heading level={1}>{t("validation:costs.title")}</Heading>}
      inputs={<TablesSkeleton />}
      resultsTitle={t("validation:costs.totals")}
      results={null}
      summary={null}
    />
  );
}

/**
 * 17 Costs (design-spec 6.3, s17-costs.html): pattern F. Startup, monthly fixed and
 * variable costs in three tables whose rows are edited in place (in a sheet on a phone),
 * each with its F/A/U, + Add row and a ⋯; the totals beside them, a lower bound while a
 * row is Empty or Unknown, and 18's break-even, changing as the amounts are typed.
 */
export function CostsScreen({
  ideaId,
  search,
  modal,
  about,
}: {
  ideaId: string;
  search: CostsSearch;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["ideas", "validation"]);
  const { me, workspace } = useWorkspace();
  const home = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(home.isPending);
  const data =
    home.data?.idea.workspaceId === workspace.id ? home.data : undefined;
  const title = data?.sections.find(({ key }) => key === "05")?.title;
  // The body reads the same rows: the panel names them.
  const rows = useQuery({
    ...costsQuery(ideaId, data?.validationId ?? ""),
    enabled: data !== undefined,
  });
  const comments: ScreenComments | undefined =
    data === undefined
      ? undefined
      : {
          screen: {
            containerType: "validation",
            containerId: data.validationId,
            sectionKeys: ["costs"],
          },
          idea: {
            id: ideaId,
            name: data.idea.name,
            archived: data.idea.archived,
          },
          dataKey: ideaKey(ideaId),
          shows: (item) =>
            item.type === "cost_item" &&
            item.key == null &&
            (rows.data === undefined ||
              rows.data.items.some(({ id }) => id === item.id)),
          labelOf: (target) => {
            if (target.type === "idea") return data.idea.name;
            const row = rows.data?.items.find(({ id }) => id === target.id);
            return row === undefined
              ? undefined
              : rowLabel("cost_item", row.name);
          },
        };
  useDocumentTitle(
    ...(data === undefined || title === undefined
      ? []
      : [title, workspace.name]),
  );

  let body: ReactNode;
  if (home.data !== undefined && data === undefined) {
    // Another workspace's idea under this one's URL (SDD 4章).
    body = <NoAccessState dashboardHref={dashboardHref(me)} />;
  } else if (data !== undefined) {
    body = (
      <CostsBody home={data} search={search} modal={modal} about={about} />
    );
  } else if (home.isError) {
    body = (
      <FailureState
        error={home.error}
        onRetry={() => void home.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  } else if (isSlow) {
    body = <SlowLoadingState onRetry={() => void home.refetch()} />;
  } else {
    body = (
      <Skeleton isLoading>
        <CostsSkeleton />
      </Skeleton>
    );
  }
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope="cost_item:"
      comments={comments}
      history={comments}
      back={{
        label: t("validation:questions.back"),
        href: ideaHref(workspace.id, ideaId),
      }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {data !== undefined && (
            <Breadcrumb href={ideaHref(workspace.id, ideaId)}>
              {data.idea.name}
            </Breadcrumb>
          )}
          {title !== undefined && <Breadcrumb>{title}</Breadcrumb>}
        </Breadcrumbs>
      }
    >
      {body}
    </WorkspaceFrame>
  );
}
