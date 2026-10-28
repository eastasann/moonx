import { hasText } from "@moonx/domain";
import { formatCount, formatDate, formatTime, i18n } from "@moonx/i18n";
import {
  assigneeNameSchema,
  dateInputSchema,
  EXECUTION_COLUMNS,
  EXECUTION_STATUSES,
  type ExecutionColumn,
  type ExecutionItem,
  type ExecutionItemCreate,
  type ExecutionStatus,
  type ExecutionType,
  type LaunchTiming,
  launchTimingSchema,
  longTextSchema,
  requiredShortTextSchema,
  shortTextSchema,
} from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Badge,
  Button,
  ButtonGroup,
  ComboBox,
  CommentCount,
  DatePicker,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Flex,
  Link,
  ListView,
  ListViewItem,
  MenuItem,
  Picker,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import type { SaveTarget } from "../lib/autosave";
import { useAutosave, useSaveItem } from "../lib/autosave-react";
import { useOneAtATime } from "../lib/form";
import { ruleErrorOf } from "../lib/input-issues";
import { useIsOnline } from "../lib/online";
import { membersQuery } from "../lib/queries";
import { toastFailure } from "./ideaActions";
import { type RowFieldsSpec, useRowFields } from "./RowFields";
import { SaveFailureNote } from "./SaveFeedback";
import { SendFailure } from "./SendFailure";
import { UserName } from "./UserName";
import { usePanel, useWorkspace } from "./workspace";

// A plan's execution items (design-spec 6.13): a row of the list, the groups of a type,
// a row's ⋯, an item's fields (to edit, or to read) and the item made new. 21 lists the
// items of its execution sub-items with them (6.12: "22 と同じ部品で一覧・追加・編集
// する"); 22 builds its tabs from the same parts.

/** The page's save of an execution item (design-spec 6.0.2: an item per row). */
export const executionKey = (itemId: string) => `execution_item:${itemId}`;

/** Where a screen holds its execution items (21: P4's item). */
export interface ExecutionCache {
  /** Puts an item as saved in the screen's data, in its list order ({@link inListOrder}). */
  put: (item: ExecutionItem) => void;
  /** Takes a deleted item out of the screen's data. */
  remove: (itemId: string) => void;
  /** Reads the items again: their version on the server replaces the screen's. */
  reload: () => void;
}

/**
 * Items in P9's order (SDD 5.9): Next Actions by their due date, none last; the other
 * types as ordered by hand. An item added or with a new date goes to its place.
 */
export function inListOrder(items: readonly ExecutionItem[]): ExecutionItem[] {
  const types = [...new Set(items.map((item) => item.type))];
  return items.toSorted((a, b) => {
    const byType = types.indexOf(a.type) - types.indexOf(b.type);
    if (byType !== 0) return byType;
    if (a.type === "next_action" && a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  });
}

type TextColumn = Exclude<ExecutionColumn, "dueDate" | "launchTiming">;

/** An item's fields as they are typed (6.13's columns, the status and the phase). */
export interface ExecutionValues {
  title: string;
  dueDate: string | null;
  status: ExecutionStatus | null;
  launchTiming: LaunchTiming | null;
  goal: string;
  exitCondition: string;
  actions: string;
  completionCriteria: string;
  kpiArea: string;
  kpiTarget: string;
  kpiReviewFrequency: string;
  kpiActual: string;
  whyItMatters: string;
  answer: string;
}

/** The assignee as P9 and P10 take it: a member or a name, never both (SDD 5.9). */
export interface AssigneeInput {
  assigneeUserId: string | null;
  assigneeName: string | null;
}

const LONG_COLUMNS: readonly TextColumn[] = [
  "goal",
  "exitCondition",
  "actions",
  "completionCriteria",
  "whyItMatters",
  "answer",
];

const TEXT_COLUMNS: readonly TextColumn[] = [
  ...LONG_COLUMNS,
  "kpiArea",
  "kpiTarget",
  "kpiReviewFrequency",
  "kpiActual",
];

/** The order of the fields of each type (6.13's columns, then the app's). */
const FIELD_ORDER: Record<
  ExecutionType,
  readonly (ExecutionColumn | "title" | "assignee" | "status")[]
> = {
  milestone: [
    "title",
    "goal",
    "assignee",
    "dueDate",
    "exitCondition",
    "status",
  ],
  launch: [
    "title",
    "launchTiming",
    "dueDate",
    "actions",
    "assignee",
    "completionCriteria",
    "status",
  ],
  kpi: [
    "kpiArea",
    "title",
    "kpiTarget",
    "kpiReviewFrequency",
    "assignee",
    "kpiActual",
  ],
  open_question: [
    "title",
    "whyItMatters",
    "assignee",
    "dueDate",
    "answer",
    "status",
  ],
  next_action: ["title", "assignee", "dueDate", "status"],
};

export const executionValues = (item: ExecutionItem): ExecutionValues => ({
  title: item.title,
  dueDate: item.dueDate,
  status: item.status,
  launchTiming: item.launchTiming,
  goal: item.goal ?? "",
  exitCondition: item.exitCondition ?? "",
  actions: item.actions ?? "",
  completionCriteria: item.completionCriteria ?? "",
  kpiArea: item.kpiArea ?? "",
  kpiTarget: item.kpiTarget ?? "",
  kpiReviewFrequency: item.kpiReviewFrequency ?? "",
  kpiActual: item.kpiActual ?? "",
  whyItMatters: item.whyItMatters ?? "",
  answer: item.answer ?? "",
});

/** A new item's values: its type's first status, a launch step under Other (P9 POST). */
const newValues = (type: ExecutionType): ExecutionValues => ({
  title: "",
  dueDate: null,
  status: EXECUTION_STATUSES[type][0] ?? null,
  launchTiming: type === "launch" ? "other" : null,
  goal: "",
  exitCondition: "",
  actions: "",
  completionCriteria: "",
  kpiArea: "",
  kpiTarget: "",
  kpiReviewFrequency: "",
  kpiActual: "",
  whyItMatters: "",
  answer: "",
});

/** The rules of the fields (design-spec 6.0.8's rows of 22). */
const executionSpec: RowFieldsSpec<ExecutionValues> = {
  errorOf: (field, value) => {
    if (field === "title") return ruleErrorOf(requiredShortTextSchema, value);
    if (field === "dueDate") {
      return value === null ? undefined : ruleErrorOf(dateInputSchema, value);
    }
    if (field === "status" || field === "launchTiming") return undefined;
    return ruleErrorOf(
      LONG_COLUMNS.includes(field as TextColumn)
        ? longTextSchema
        : shortTextSchema,
      value,
    );
  },
  toWire: (_field, value) => value,
  fromWire: (field, value) =>
    (TEXT_COLUMNS.includes(field as TextColumn) || field === "title"
      ? (value ?? "")
      : value) as never,
  isChoice: (field) =>
    field === "status" || field === "launchTiming" || field === "dueDate",
};

/** The item's assignee as the fields hold it, from what waits to be saved. */
function assigneeOf(
  item: ExecutionItem,
  unsaved: Record<string, unknown> | undefined,
): AssigneeInput {
  if (
    unsaved !== undefined &&
    (Object.hasOwn(unsaved, "assigneeUserId") ||
      Object.hasOwn(unsaved, "assigneeName"))
  ) {
    return {
      assigneeUserId: (unsaved.assigneeUserId as string | null) ?? null,
      assigneeName: (unsaved.assigneeName as string | null) ?? null,
    };
  }
  const { assignee } = item;
  return {
    assigneeUserId:
      assignee !== null && "user" in assignee ? assignee.user.id : null,
    assigneeName:
      assignee !== null && "name" in assignee ? assignee.name : null,
  };
}

/**
 * A change of the assignee field: a member chosen or a name typed, or a name typed against
 * its rule (6.0.8), which is not saved.
 */
export type AssigneeChange =
  | { kind: "value"; value: AssigneeInput; isChoice: boolean }
  | { kind: "invalid" };

/**
 * The assignee (design-spec 6.13 "Assignee"): an Owner or Member of the workspace, or a
 * name written freely (6.0.8: up to 60 characters). A name is saved as it is typed; a
 * member when chosen.
 */
function AssigneeField({
  value,
  currentUser,
  onChange,
  isReadOnly,
}: {
  value: AssigneeInput;
  /** The member assigned now, kept in the list when they are no longer one. */
  currentUser: { id: string; displayName: string } | null;
  onChange: (change: AssigneeChange) => void;
  isReadOnly: boolean;
}) {
  const { t } = useTranslation(["plans", "app"]);
  const { workspace } = useWorkspace();
  const members = useQuery(membersQuery(workspace.id));
  const items = (members.data?.items ?? [])
    .filter((member) => member.role !== "viewer")
    .map((member) => ({ id: member.user.id, label: member.user.displayName }));
  if (
    currentUser !== null &&
    value.assigneeUserId === currentUser.id &&
    !items.some((item) => item.id === currentUser.id)
  ) {
    items.push({ id: currentUser.id, label: currentUser.displayName });
  }
  const labelOf = (id: string | null) =>
    items.find((item) => item.id === id)?.label;
  const [typed, setTyped] = useState<string | null>(null);
  // The member chosen this moment: the ComboBox writes their label as the text right
  // after the choice, before `value` has caught up.
  const chosen = useRef<string | null>(null);
  const text =
    typed ?? labelOf(value.assigneeUserId) ?? value.assigneeName ?? "";
  // What is typed says why it breaks the rule even after the name on its way was dropped
  // and the field holds the saved assignee again (6.0.8).
  const error =
    typed === null ? undefined : ruleErrorOf(assigneeNameSchema, typed);
  const combo = (
    <ComboBox
      label={t("plans:execution.assignee")}
      items={items}
      value={value.assigneeUserId}
      inputValue={text}
      allowsCustomValue
      customValueLabel={(name) => t("plans:execution.useName", { name })}
      placeholder={t("plans:execution.noAssignee")}
      onChange={(id) => {
        if (id === null) return;
        chosen.current = id;
        setTyped(null);
        onChange({
          kind: "value",
          value: { assigneeUserId: id, assigneeName: null },
          isChoice: true,
        });
      }}
      onInputChange={(next) => {
        // Choosing a member (again) writes their name in the field: not a name typed.
        const member = chosen.current ?? value.assigneeUserId;
        chosen.current = null;
        if (member !== null && next === labelOf(member)) {
          setTyped(null);
          return;
        }
        setTyped(next);
        if (ruleErrorOf(assigneeNameSchema, next) !== undefined) {
          onChange({ kind: "invalid" });
          return;
        }
        onChange({
          kind: "value",
          value: {
            assigneeUserId: null,
            assigneeName: next.trim() === "" ? null : next,
          },
          isChoice: false,
        });
      }}
      errorMessage={error}
      isDisabled={isReadOnly}
      width="full"
    />
  );
  if (isReadOnly || !members.isError) return combo;
  // Without the members the list is empty, which reads as a workspace with no one to pick
  // (6.0.6: say why, with Retry).
  return (
    <Stack gap="space-75">
      {combo}
      <Flex gap="space-100" alignItems="center" wrap>
        <Text variant="caption" tone="notice">
          {t("plans:execution.membersFailed")}
        </Text>
        <Button
          variant="secondary"
          isQuiet
          size="S"
          onPress={() => void members.refetch()}
        >
          {t("app:state.retry")}
        </Button>
      </Flex>
    </Stack>
  );
}

/**
 * The fields of an execution item of `type`: 6.13's columns in their order (the first
 * required), then the status. Shared by a new item and one saved as it is typed.
 */
export function ExecutionItemFields({
  type,
  values,
  errors,
  onChange,
  onBlur,
  assignee,
  assigneeUser,
  onAssigneeChange,
  actualUpdatedAt,
  isReadOnly,
  autoFocus = false,
}: {
  type: ExecutionType;
  values: ExecutionValues;
  errors: Partial<Record<keyof ExecutionValues, string>>;
  onChange: <F extends keyof ExecutionValues>(
    field: F,
    value: ExecutionValues[F],
  ) => void;
  onBlur?: (field: keyof ExecutionValues) => void;
  assignee: AssigneeInput;
  assigneeUser: { id: string; displayName: string } | null;
  onAssigneeChange: (change: AssigneeChange) => void;
  /** When the KPI's Actual was last changed: shown under it. */
  actualUpdatedAt?: string | null;
  isReadOnly: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation(["plans", "common"]);
  const { me } = useWorkspace();
  const fieldLabel = (column: ExecutionColumn | "title") =>
    t(`plans:execution.field.${type}.${column}` as never);
  const text = (column: TextColumn | "title") => {
    const props = {
      label: fieldLabel(column),
      value: values[column],
      onChange: (value: string) => onChange(column, value),
      onBlur: () => onBlur?.(column),
      errorMessage: errors[column],
      isReadOnly,
      width: "full" as const,
    };
    if (column === "title") {
      return (
        <TextField key={column} {...props} isRequired autoFocus={autoFocus} />
      );
    }
    if (LONG_COLUMNS.includes(column)) {
      return <TextArea key={column} {...props} />;
    }
    return (
      <TextField
        key={column}
        {...props}
        description={
          column === "kpiActual" &&
          actualUpdatedAt !== null &&
          actualUpdatedAt !== undefined
            ? actualUpdatedText(actualUpdatedAt, me.timezone)
            : undefined
        }
      />
    );
  };
  const statuses = EXECUTION_STATUSES[type];
  return (
    <Stack gap="space-300">
      {FIELD_ORDER[type].map((field) => {
        switch (field) {
          case "assignee":
            return (
              <AssigneeField
                key={field}
                value={assignee}
                currentUser={assigneeUser}
                onChange={onAssigneeChange}
                isReadOnly={isReadOnly}
              />
            );
          case "status":
            return statuses.length === 0 ? null : (
              <Picker
                key={field}
                label={t("plans:execution.status")}
                items={statuses.map((status) => ({
                  id: status,
                  label: t(`common:executionStatus.${status}`),
                }))}
                value={values.status}
                onChange={(value) =>
                  value !== null && onChange("status", value as ExecutionStatus)
                }
                isDisabled={isReadOnly}
              />
            );
          case "launchTiming":
            return (
              <Picker
                key={field}
                label={fieldLabel("launchTiming")}
                items={launchTimingSchema.options.map((timing) => ({
                  id: timing,
                  label: t(`common:launchTiming.${timing}`),
                }))}
                value={values.launchTiming}
                onChange={(value) =>
                  value !== null &&
                  onChange("launchTiming", value as LaunchTiming)
                }
                isDisabled={isReadOnly}
              />
            );
          case "dueDate":
            return (
              <DatePicker
                key={field}
                label={fieldLabel("dueDate")}
                value={values.dueDate}
                onChange={(value) => onChange("dueDate", value)}
                errorMessage={errors.dueDate}
                isReadOnly={isReadOnly}
              />
            );
          default:
            return text(field);
        }
      })}
    </Stack>
  );
}

/** "Updated {date}, {time}": when a KPI's Actual last changed (6.13「更新日時」). */
const actualUpdatedText = (at: string, timeZone: string) =>
  i18n.t("plans:execution.actualUpdated", {
    date: formatDate(at, { timeZone }),
    time: formatTime(at, { timeZone }),
  });

/** The save of an item's fields (P10 PATCH), putting the saved item in the screen's data. */
export function executionTarget(
  cache: ExecutionCache,
  itemId: string,
  noun: string,
  onSaved?: () => void,
): SaveTarget {
  return {
    key: executionKey(itemId),
    noun,
    send: async (fields, lockVersion, force) => {
      const item = await unwrap(
        api()
          .api.v1["execution-items"]({ itemId: inPath(itemId) })
          .patch({ ...fields, lockVersion, ...(force ? { force } : {}) }),
      );
      cache.put(item);
      onSaved?.();
      return item.lockVersion;
    },
    // Their version names the assignee by id only (the history's shape): the items are
    // read again for the whole item.
    loadTheirs: () => cache.reload(),
  };
}

/**
 * An item's fields saved as they are typed (design-spec 6.0.2, an item per row): a field
 * that breaks its rule says why and is not sent, the assignee goes with both of its
 * fields, one of them null.
 */
export function ExecutionItemEditor({
  item,
  target,
  autoFocus = false,
}: {
  item: ExecutionItem;
  target: SaveTarget;
  autoFocus?: boolean;
}) {
  const autosave = useAutosave();
  const isOnline = useIsOnline();
  const saving = useSaveItem(target.key);
  const fields = useRowFields<ExecutionValues>(
    target,
    item.lockVersion,
    executionValues(item),
    executionSpec,
  );
  const assignee = assigneeOf(item, saving?.unsaved);
  const assigneeUser =
    item.assignee !== null && "user" in item.assignee
      ? item.assignee.user
      : null;
  return (
    <Stack gap="space-300">
      <SaveFailureNote itemKey={target.key} />
      <ExecutionItemFields
        type={item.type}
        values={fields.values}
        errors={fields.errors}
        onChange={fields.change}
        onBlur={fields.blur}
        assignee={assignee}
        assigneeUser={assigneeUser}
        onAssigneeChange={(change) => {
          if (change.kind === "invalid") {
            // Not saved (6.0.8): a name typed on the way to it is not sent either.
            autosave.discard(target.key, ["assigneeUserId", "assigneeName"]);
            return;
          }
          autosave.change(target, item.lockVersion, { ...change.value });
          if (change.isChoice) autosave.flush(target.key);
        }}
        actualUpdatedAt={item.kpiActualUpdatedAt}
        isReadOnly={!isOnline}
        autoFocus={autoFocus}
      />
    </Stack>
  );
}

/** An item to read (a Viewer, an archived plan, a saved version). */
export function ExecutionItemFacts({ item }: { item: ExecutionItem }) {
  const { t } = useTranslation(["plans", "common"]);
  const { me } = useWorkspace();
  const empty = <Text tone="secondary">{t("plans:home.empty")}</Text>;
  const words = (value: string | null) => (hasText(value) ? value : empty);
  const fieldLabel = (column: ExecutionColumn | "title") =>
    t(`plans:execution.field.${item.type}.${column}` as never);
  const rows: ReactNode[] = FIELD_ORDER[item.type].flatMap((field) => {
    switch (field) {
      case "title":
        return [];
      case "assignee":
        return [
          <DescriptionListItem
            key={field}
            label={t("plans:execution.assignee")}
          >
            <AssigneeText item={item} />
          </DescriptionListItem>,
        ];
      case "status":
        return item.status === null
          ? []
          : [
              <DescriptionListItem
                key={field}
                label={t("plans:execution.status")}
              >
                {t(`common:executionStatus.${item.status}`)}
              </DescriptionListItem>,
            ];
      case "launchTiming":
        return [
          <DescriptionListItem key={field} label={fieldLabel(field)}>
            {t(`common:launchTiming.${item.launchTiming ?? "other"}`)}
          </DescriptionListItem>,
        ];
      case "dueDate":
        return [
          <DescriptionListItem key={field} label={fieldLabel(field)}>
            {item.dueDate === null
              ? empty
              : formatDate(item.dueDate, { timeZone: me.timezone })}
          </DescriptionListItem>,
        ];
      default:
        return [
          <DescriptionListItem key={field} label={fieldLabel(field)}>
            {field === "kpiActual" && item.kpiActualUpdatedAt !== null ? (
              <Stack gap="space-25">
                {words(item[field])}
                <Text variant="caption" tone="secondary">
                  {actualUpdatedText(item.kpiActualUpdatedAt, me.timezone)}
                </Text>
              </Stack>
            ) : (
              words(item[field])
            )}
          </DescriptionListItem>,
        ];
    }
  });
  return <DescriptionList>{rows}</DescriptionList>;
}

/** Who an item is assigned to: a member's name, a name written freely, or no one. */
function AssigneeText({ item }: { item: ExecutionItem }) {
  const { t } = useTranslation(["plans"]);
  const { assignee } = item;
  if (assignee === null) {
    return <Text tone="secondary">{t("plans:execution.noAssignee")}</Text>;
  }
  return "user" in assignee ? <UserName user={assignee.user} /> : assignee.name;
}

/** What a new item is made with (P9 POST): its type's fields that were filled. */
function createBody(
  type: ExecutionType,
  values: ExecutionValues,
  assignee: AssigneeInput,
): ExecutionItemCreate {
  const columns = EXECUTION_COLUMNS[type];
  const body: Record<string, unknown> = { type, title: values.title };
  for (const column of columns) {
    const value = values[column];
    if (value !== null && value !== "") body[column] = value;
  }
  if (values.status !== null && EXECUTION_STATUSES[type].length > 0) {
    body.status = values.status;
  }
  if (assignee.assigneeUserId !== null) {
    body.assigneeUserId = assignee.assigneeUserId;
  } else if (assignee.assigneeName !== null) {
    body.assigneeName = assignee.assigneeName;
  }
  return body as ExecutionItemCreate;
}

/**
 * A new item of `type` (design-spec 6.13 "+ Add"): its fields, then Add, which makes it
 * last in its type. The first column is required (6.0.8); failures as 16's new row.
 */
export function NewExecutionItem({
  planId,
  type,
  onMade,
  onCreated,
  onCancel,
}: {
  planId: string;
  type: ExecutionType;
  /** The item is made: put it in the screen's data, even once the form is closed. */
  onMade: (item: ExecutionItem) => void;
  /** The item is made while the form is open: close it (22 shows the item). */
  onCreated: (item: ExecutionItem) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["plans", "errors"]);
  const isOnline = useIsOnline();
  const [values, setValues] = useState(() => newValues(type));
  const [assignee, setAssignee] = useState<AssigneeInput>({
    assigneeUserId: null,
    assigneeName: null,
  });
  const [isAssigneeInvalid, setAssigneeInvalid] = useState(false);
  // A field's reason shows once it changed, as 16's new row.
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const latestOnCreated = useRef(onCreated);
  latestOnCreated.current = onCreated;
  const latestOnMade = useRef(onMade);
  latestOnMade.current = onMade;
  const oneAtATime = useOneAtATime();
  const create = useMutation({
    mutationFn: (body: ExecutionItemCreate) =>
      unwrap(
        api()
          .api.v1.plans({ planId: inPath(planId) })
          ["execution-items"].post(body),
      ),
    // Here, not in `mutate`'s: it runs after a Cancel pressed while Add was on its way.
    onSuccess: (item) => latestOnMade.current(item),
  });
  const failure = create.error;
  const details =
    failure instanceof ApiError && failure.code === "VALIDATION_FAILED"
      ? failure.detail.details
      : undefined;
  const fields = Object.keys(values) as (keyof ExecutionValues)[];
  const refusedFields = fields.filter(
    (field) =>
      Array.isArray(details) &&
      (details as { path?: unknown }[]).some(({ path }) => path === field),
  );
  const errors = Object.fromEntries(
    fields.flatMap((field) => {
      const error =
        touched[field] === true
          ? executionSpec.errorOf(field, values[field])
          : undefined;
      const shown =
        error ??
        (refusedFields.includes(field) ? t("errors:input.format") : undefined);
      return shown === undefined ? [] : [[field, shown]];
    }),
  );
  const isValid =
    fields.every(
      (field) => executionSpec.errorOf(field, values[field]) === undefined,
    ) && !isAssigneeInvalid;
  const canSubmit = isOnline && isValid;
  const submit = () =>
    void oneAtATime(
      () =>
        new Promise<void>((resolve) => {
          create.mutate(createBody(type, values, assignee), {
            // Fires only while the form is still open: Cancel meanwhile keeps the user
            // where they went (the item is made all the same).
            onSuccess: (item) => latestOnCreated.current(item),
            onSettled: () => resolve(),
          });
        }),
    );
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
      size="M"
      title={t(`plans:execution.newTitle.${type}`)}
      buttons={
        <ButtonGroup align="end">
          <Button variant="secondary" onPress={onCancel}>
            {t("plans:execution.cancel")}
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            isDisabled={!canSubmit}
            isPending={create.isPending}
          >
            {t("plans:execution.add")}
          </Button>
        </ButtonGroup>
      }
    >
      <Stack gap="space-300">
        <ExecutionItemFields
          type={type}
          values={values}
          errors={errors}
          onChange={(field, value) => {
            if (refusedFields.includes(field)) create.reset();
            setValues((current) => ({ ...current, [field]: value }));
            setTouched((current) => ({ ...current, [field]: true }));
          }}
          assignee={assignee}
          assigneeUser={null}
          onAssigneeChange={(change) => {
            setAssigneeInvalid(change.kind === "invalid");
            if (change.kind === "value") setAssignee(change.value);
          }}
          isReadOnly={!isOnline}
          autoFocus
        />
        {failure !== null && refusedFields.length === 0 && (
          <SendFailure
            error={failure}
            transient="couldNotSave"
            withSaveReasons
            onRetry={submit}
            isRetryDisabled={!canSubmit}
          />
        )}
      </Stack>
    </Dialog>
  );
}

/** The question before an item is deleted: it comes back from the history (6.0.5). */
function DeleteExecutionItemQuestion({
  type,
  onDelete,
  onClose,
}: {
  type: ExecutionType;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["plans", "validation"]);
  return (
    <AlertDialog
      isOpen
      variant="destructive"
      size="S"
      title={t(`plans:execution.deleteTitle.${type}`)}
      primaryActionLabel={t("plans:execution.delete")}
      cancelLabel={t("plans:execution.cancel")}
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

/** The groups a type's items show in: a launch step's phase, a KPI's Area (6.13). */
export function executionGroups(
  type: ExecutionType,
  items: readonly ExecutionItem[],
  noArea: string,
  phaseName: (timing: LaunchTiming) => string,
): { id: string; title: string | null; items: ExecutionItem[] }[] {
  if (type === "launch") {
    return launchTimingSchema.options.flatMap((timing) => {
      const inPhase = items.filter(
        (item) => (item.launchTiming ?? "other") === timing,
      );
      return inPhase.length === 0
        ? []
        : [{ id: timing, title: phaseName(timing), items: inPhase }];
    });
  }
  if (type === "kpi") {
    const areas = new Map<string, ExecutionItem[]>();
    for (const item of items) {
      const area = hasText(item.kpiArea) ? (item.kpiArea ?? "") : "";
      areas.set(area, [...(areas.get(area) ?? []), item]);
    }
    return [...areas].map(([area, inArea]) => ({
      id: `area:${area}`,
      title: area === "" ? noArea : area,
      items: inArea,
    }));
  }
  return [{ id: type, title: null, items: [...items] }];
}

/** What a row says under its first column: the state, the assignee, the date. */
function RowMeta({ item }: { item: ExecutionItem }) {
  const { t } = useTranslation(["plans", "common", "app"]);
  const { me } = useWorkspace();
  const parts: ReactNode[] = [];
  if (item.type === "kpi") {
    for (const column of ["kpiTarget", "kpiActual"] as const) {
      const value = item[column];
      if (hasText(value)) {
        parts.push(
          t("plans:table.cell", {
            label: t(`plans:execution.field.kpi.${column}`),
            value,
          }),
        );
      }
    }
  }
  if (item.status !== null) {
    parts.push(t(`common:executionStatus.${item.status}`));
  }
  if (item.assignee !== null) parts.push(<AssigneeText item={item} />);
  if (item.dueDate !== null) {
    parts.push(formatDate(item.dueDate, { timeZone: me.timezone }));
  }
  return (
    <Flex columnGap="space-100" alignItems="center" wrap>
      {parts.length > 0 && (
        <Text variant="caption" tone="secondary">
          {parts.map((part, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the parts are in a fixed order per item
            <span key={index}>
              {index > 0 && t("app:separator")}
              {part}
            </span>
          ))}
        </Text>
      )}
      {item.overdue && (
        <Badge variant="notice">{t("plans:execution.overdue")}</Badge>
      )}
    </Flex>
  );
}

/**
 * A row of a type's list (6.13): its first column with its comments' count, and under it
 * its state, assignee and date (a KPI's Target and Actual first), "Overdue" past its date.
 * Where the item can be changed, a save of it that failed says so here too, with Retry
 * (6.0.2: beside the row as well as in the fields that were typed).
 */
export function ExecutionRowContent({
  item,
  canEdit,
}: {
  item: ExecutionItem;
  canEdit: boolean;
}) {
  return (
    <Stack gap="space-25">
      <Flex columnGap="space-100" alignItems="center" wrap>
        <Text variant="label">{item.title}</Text>
        {item.commentCount > 0 && (
          <Text variant="caption" tone="secondary">
            <CommentCount count={item.commentCount} />
          </Text>
        )}
      </Flex>
      <RowMeta item={item} />
      {canEdit && <SaveFailureNote itemKey={executionKey(item.id)} />}
    </Stack>
  );
}

/**
 * A row's ⋯ (6.0.4・6.0.5): Comments (with their count) and History for everyone, Reorder
 * (22's, 6.13) and Delete for who can change the plan (asked first, by the caller).
 */
export function ExecutionItemMenu({
  item,
  canEdit,
  onReorder,
  onDelete,
}: {
  item: ExecutionItem;
  canEdit: boolean;
  /** Opens 6.10's Reorder dialog on the row's list: none where its type is not ordered. */
  onReorder?: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation(["plans", "panels"]);
  const panel = usePanel();
  const isOnline = useIsOnline();
  const target = {
    kind: "item",
    item: { type: "execution_item", id: item.id, key: null },
  } as const;
  return (
    <ActionMenu
      size="S"
      aria-label={t("plans:execution.more", { title: item.title })}
      disabledKeys={isOnline ? [] : ["delete"]}
      onAction={(key) => {
        if (key === "comments") panel.show("comments", target);
        if (key === "history") panel.show("history", target);
        if (key === "reorder") onReorder?.();
        if (key === "delete") onDelete();
      }}
    >
      <MenuItem id="comments">
        {item.commentCount > 0
          ? t("panels:comments.menuCount", {
              formatted: formatCount(item.commentCount),
            })
          : t("panels:comments.menu")}
      </MenuItem>
      <MenuItem id="history">{t("panels:history.menu")}</MenuItem>
      {canEdit && onReorder !== undefined && (
        <MenuItem id="reorder">{t("plans:execution.reorder")}</MenuItem>
      )}
      {canEdit && (
        <MenuItem id="delete">{t("plans:execution.delete")}</MenuItem>
      )}
    </ActionMenu>
  );
}

/**
 * Deletes an item (P10 DELETE) once asked: `ask(item)` puts up the question, which the
 * returned `question` element holds; the item leaves the screen's data when it is gone.
 */
export function useDeleteExecutionItem(
  cache: ExecutionCache,
  onSaved: () => void,
) {
  const [deleting, setDeleting] = useState<ExecutionItem | null>(null);
  const remove = useMutation({
    mutationFn: (itemId: string) =>
      unwrap(
        api()
          .api.v1["execution-items"]({ itemId: inPath(itemId) })
          .delete(),
      ),
    onSettled: (_data, error, itemId) => {
      // Deleted, here or already elsewhere (P10 answers 404 for a deleted item).
      if (
        error !== null &&
        !(error instanceof ApiError && error.code === "NOT_FOUND")
      ) {
        toastFailure(error, () => remove.mutate(itemId));
        return;
      }
      cache.remove(itemId);
      onSaved();
    },
  });
  return {
    ask: (item: ExecutionItem) => setDeleting(item),
    question:
      deleting === null ? null : (
        <DeleteExecutionItemQuestion
          type={deleting.type}
          onDelete={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      ),
  };
}

/**
 * 21's list of the items of one type (design-spec 6.12・6.13): launch steps under their
 * phases, KPIs under their Areas, Next Actions by their due date (P9's order), each row
 * an {@link ExecutionRowContent} with its {@link ExecutionItemMenu}; pressing a row opens
 * it in a Dialog. "+ Add" under the list, and "Nothing yet" while it has none (6.12
 * 「21 の状態」); "Open in Execution" to 22's tab of the type.
 */
export function ExecutionList({
  planId,
  type,
  items,
  cache,
  canEdit,
  onSaved,
  executionHref,
}: {
  planId: string;
  type: ExecutionType;
  items: readonly ExecutionItem[];
  cache: ExecutionCache;
  /** Owners and Members, the plan and idea not archived, no version open. */
  canEdit: boolean;
  /** An item was made, changed or deleted: what counts the items reads again. */
  onSaved: () => void;
  /** 22 on the type's tab (6.12「Open in Execution」). */
  executionHref: string;
}) {
  const { t } = useTranslation(["plans", "common", "app"]);
  const isOnline = useIsOnline();
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAdding, setAdding] = useState(false);
  const deletion = useDeleteExecutionItem(cache, onSaved);
  const open = items.find((item) => item.id === openId);
  const groups = executionGroups(
    type,
    items,
    t("plans:execution.noArea"),
    (timing) => t(`common:launchTiming.${timing}`),
  );
  const listName = t(`plans:execution.list.${type}`);
  return (
    <Stack gap="space-200">
      {items.length === 0 ? (
        <Text tone="secondary" elementType="p">
          {t("plans:execution.nothingYet")}
        </Text>
      ) : (
        groups.map((group) => (
          <ListView
            key={group.id}
            aria-label={
              group.title === null
                ? listName
                : `${listName}${t("app:separator")}${group.title}`
            }
            title={group.title ?? undefined}
            items={group.items}
            dependencies={[canEdit, isOnline]}
            onAction={(key) => setOpenId(String(key))}
          >
            {(item) => (
              <ListViewItem
                id={item.id}
                textValue={item.title}
                actions={
                  <ExecutionItemMenu
                    item={item}
                    canEdit={canEdit}
                    onDelete={() => deletion.ask(item)}
                  />
                }
              >
                <ExecutionRowContent item={item} canEdit={canEdit} />
              </ListViewItem>
            )}
          </ListView>
        ))
      )}
      <Flex alignItems="center" columnGap="space-300" wrap>
        {canEdit && (
          <Button
            variant="secondary"
            isQuiet
            size="S"
            aria-label={t(`plans:execution.addTo.${type}`)}
            onPress={() => setAdding(true)}
            isDisabled={!isOnline}
          >
            <Plus />
            {t("plans:execution.add")}
          </Button>
        )}
        <Link href={executionHref}>{t("plans:execution.openInExecution")}</Link>
      </Flex>
      {open !== undefined && (
        <Dialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setOpenId(null);
          }}
          isDismissable
          size="M"
          title={canEdit ? t(`plans:execution.editTitle.${type}`) : open.title}
        >
          {canEdit ? (
            <ExecutionItemEditor
              item={open}
              target={executionTarget(
                cache,
                open.id,
                t("plans:execution.noun"),
                onSaved,
              )}
              autoFocus
            />
          ) : (
            <ExecutionItemFacts item={open} />
          )}
        </Dialog>
      )}
      {isAdding && canEdit && (
        <NewExecutionItem
          planId={planId}
          type={type}
          onMade={(item) => {
            cache.put(item);
            onSaved();
          }}
          onCreated={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}
      {deletion.question}
    </Stack>
  );
}
