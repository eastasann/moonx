import { hasText } from "@moonx/domain";
import type {
  Assumption,
  Confidence,
  Risk,
  ValidationHome,
} from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Breadcrumb,
  Breadcrumbs,
  Button,
  ButtonGroup,
  CommentCount,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Flex,
  Heading,
  IllustratedMessage,
  ListDetailPattern,
  ListView,
  ListViewItem,
  MenuItem,
  Stack,
  Text,
  useIsNarrow,
  useTwoColumns,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ListChecks, ShieldAlert } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  AssumptionFields,
  type AssumptionValues,
  assumptionSpec,
  assumptionValues,
  newAssumptionValues,
  newRiskValues,
  RiskFields,
  type RiskValues,
  riskSpec,
  riskValues,
} from "../components/AssumptionFields";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import { ModalBoundary } from "../components/ErrorBoundary";
import { ItemHistoryButton } from "../components/HistoryPanel";
import {
  useFailureOnceClosed,
  useToastFailure,
} from "../components/ideaActions";
import { useKeepShownItem } from "../components/keepShownItem";
import { ReorderDialog } from "../components/ReorderDialog";
import { RowEvidence, RowEvidenceSheet } from "../components/RowEvidence";
import {
  isRefusedForGood,
  isRowValid,
  type RowFieldsSpec,
  refusedFieldsOf,
  useReadAgainWhenRefused,
  useRowFields,
} from "../components/RowFields";
import { SaveFailureNote } from "../components/SaveFeedback";
import { SectionTitle } from "../components/SectionTitle";
import { SendFailure } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useSlowLoading,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import {
  dashboardHref,
  useAskedOpen,
  useModal,
  usePanel,
  useSearchModalAbout,
  useWorkspace,
} from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import type { SaveTarget } from "../lib/autosave";
import { countingEvidence } from "../lib/evidence";
import { useOneAtATime } from "../lib/form";
import { rowLabel } from "../lib/item-labels";
import {
  type AssumptionsSearch,
  type AssumptionsTab,
  assumptionsHref,
  ideaHref,
  ideasHref,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  assumptionsQuery,
  ideaKey,
  putSaved,
  risksQuery,
  useIsValidationRead,
  validationHomeQuery,
} from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { useDocumentTitle } from "../lib/title";
import { AssumptionsSkeleton, ListSkeleton } from "./AssumptionsRisksSkeleton";

export type { AssumptionsSearch };

/** A row of either list. */
type Row = Assumption | Risk;

/** The target type of a list's rows (SDD 5.2 TargetRef). */
const typeOf = { assumptions: "assumption", risks: "risk" } as const;

/** The page's save of a row (design-spec 6.0.2's item "1つの行"). */
const rowKey = (tab: AssumptionsTab, rowId: string) =>
  `${typeOf[tab]}:${rowId}`;

/** M2's `about` for an assumption (SDD 4章). */
const aboutOf = (rowId: string) => `assumption:${rowId}`;

/** The list's data, as V10 answers it. */
const listOf = (ideaId: string, validationId: string, tab: AssumptionsTab) =>
  tab === "assumptions"
    ? assumptionsQuery(ideaId, validationId)
    : risksQuery(ideaId, validationId);

/** Puts a row, as saved, in its list: in its place, or last when it is new. */
function putRow(
  queryClient: QueryClient,
  ideaId: string,
  validationId: string,
  tab: AssumptionsTab,
  row: Partial<Row> & { id: string },
) {
  putSaved<{ items: Row[] }>(
    queryClient,
    listOf(ideaId, validationId, tab).queryKey,
    (data) => {
      if (data === undefined) return undefined;
      const isListed = data.items.some(({ id }) => id === row.id);
      return {
        items: isListed
          ? data.items.map((current) =>
              current.id === row.id ? ({ ...current, ...row } as Row) : current,
            )
          : [...data.items, row as Row],
      };
    },
  );
}

/** The save of a row's fields (V11 PATCH). */
function rowTarget(
  queryClient: QueryClient,
  ideaId: string,
  validationId: string,
  tab: AssumptionsTab,
  rowId: string,
  noun: string,
): SaveTarget {
  const { queryKey } = listOf(ideaId, validationId, tab);
  return {
    key: rowKey(tab, rowId),
    noun,
    send: async (fields, lockVersion, force) => {
      const body = { ...fields, lockVersion, ...(force ? { force } : {}) };
      const row =
        tab === "assumptions"
          ? await unwrap(
              api()
                .api.v1.assumptions({ id: inPath(rowId) })
                .patch(body),
            )
          : await unwrap(
              api()
                .api.v1.risks({ id: inPath(rowId) })
                .patch(body),
            );
      putRow(queryClient, ideaId, validationId, tab, row);
      // Risks in the automatic order move with their Impact and Probability (6.10).
      if (
        tab === "risks" &&
        row.sortOrder === null &&
        (Object.hasOwn(fields, "impact") ||
          Object.hasOwn(fields, "probability"))
      ) {
        void queryClient.invalidateQueries({ queryKey });
      }
      // 13's section counts read the lists.
      void queryClient.invalidateQueries({
        queryKey: validationHomeQuery(ideaId).queryKey,
        refetchType: "none",
      });
      return row.lockVersion;
    },
    // Their version carries the evidence by id only (the history's shape): the list is
    // read again for the whole row.
    loadTheirs: () => void queryClient.invalidateQueries({ queryKey }),
  };
}

/** The values and rules of a list's fields. */
const formOf = {
  assumptions: {
    values: (row: Row) => assumptionValues(row as Assumption),
    empty: newAssumptionValues,
    spec: assumptionSpec,
  },
  risks: {
    values: (row: Row) => riskValues(row as Risk),
    empty: newRiskValues,
    spec: riskSpec,
  },
} as const;

/**
 * A row's fields saved as they are typed (design-spec 6.0.2, the row its item); an
 * assumption's evidence with Add evidence (M2).
 */
function RowEditor({
  ideaId,
  validationId,
  tab,
  row,
  autoFocus = false,
  onOpenEvidence,
}: {
  ideaId: string;
  validationId: string;
  tab: AssumptionsTab;
  row: Row;
  autoFocus?: boolean;
  /** Opens M2; none once the screen, read again, no longer lets the user edit. */
  onOpenEvidence: (() => void) | undefined;
}) {
  const { t } = useTranslation(["validation"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const target = rowTarget(
    queryClient,
    ideaId,
    validationId,
    tab,
    row.id,
    t(`validation:assumptions.noun.${tab}`),
  );
  const fields = useRowFields<AssumptionValues | RiskValues>(
    target,
    row.lockVersion,
    formOf[tab].values(row),
    formOf[tab].spec as RowFieldsSpec<AssumptionValues | RiskValues>,
  );
  const props = {
    errors: fields.errors,
    onChange: fields.change,
    onBlur: fields.blur,
    isReadOnly: !isOnline,
    autoFocus,
  };
  return (
    <Stack gap="space-300">
      <SaveFailureNote itemKey={target.key} />
      {tab === "assumptions" ? (
        <AssumptionFields
          {...(props as Parameters<typeof AssumptionFields>[0])}
          values={fields.values as AssumptionValues}
          evidence={
            <RowEvidence
              evidence={(row as Assumption).evidence}
              onAdd={onOpenEvidence}
            />
          }
        />
      ) : (
        <RiskFields
          {...(props as Parameters<typeof RiskFields>[0])}
          values={fields.values as RiskValues}
        />
      )}
    </Stack>
  );
}

/** A row to read (a Viewer, an archived idea, a phone's detail). */
function RowFacts({ tab, row }: { tab: AssumptionsTab; row: Row }) {
  const { t } = useTranslation(["validation", "common"]);
  const empty = <Text tone="secondary">{t("validation:rows.empty")}</Text>;
  const text = (value: string | null) => (hasText(value) ? value : empty);
  const level = (value: Confidence | null) =>
    value === null ? empty : t(`common:confidence.${value}`);
  if (tab === "assumptions") {
    const assumption = row as Assumption;
    return (
      <Stack gap="space-300">
        <DescriptionList>
          <DescriptionListItem
            label={t("validation:assumptions.field.whyBelieve")}
          >
            {text(assumption.whyBelieve)}
          </DescriptionListItem>
        </DescriptionList>
        <RowEvidence evidence={assumption.evidence} />
        <DescriptionList>
          <DescriptionListItem
            label={t("validation:assumptions.field.evidenceNote")}
          >
            {text(assumption.evidenceNote)}
          </DescriptionListItem>
          <DescriptionListItem
            label={t("validation:assumptions.field.confidence")}
          >
            {level(assumption.confidence)}
          </DescriptionListItem>
          <DescriptionListItem
            label={t("validation:assumptions.field.disproveCondition")}
          >
            {text(assumption.disproveCondition)}
          </DescriptionListItem>
          <DescriptionListItem
            label={t("validation:assumptions.field.nextCheck")}
          >
            {text(assumption.nextCheck)}
          </DescriptionListItem>
        </DescriptionList>
      </Stack>
    );
  }
  const risk = row as Risk;
  return (
    <DescriptionList>
      <DescriptionListItem
        label={t("validation:assumptions.field.probability")}
      >
        {level(risk.probability)}
      </DescriptionListItem>
      <DescriptionListItem label={t("validation:assumptions.field.impact")}>
        {level(risk.impact)}
      </DescriptionListItem>
      <DescriptionListItem label={t("validation:assumptions.field.whyMatters")}>
        {text(risk.whyMatters)}
      </DescriptionListItem>
      <DescriptionListItem label={t("validation:assumptions.field.mitigation")}>
        {text(risk.mitigation)}
      </DescriptionListItem>
      <DescriptionListItem
        label={t("validation:assumptions.field.howToValidate")}
      >
        {text(risk.howToValidate)}
      </DescriptionListItem>
    </DescriptionList>
  );
}

/** The question before a row is deleted (design-spec 6.10「14〜16 共通」). */
function DeleteRowQuestion({
  tab,
  onDelete,
  onClose,
}: {
  tab: AssumptionsTab;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  return (
    <AlertDialog
      isOpen
      variant="destructive"
      size="S"
      title={t(`validation:assumptions.deleteTitle.${tab}`)}
      primaryActionLabel={t("validation:assumptions.delete")}
      cancelLabel={t("validation:assumptions.cancel")}
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
 * The selected row (design-spec 6.10): its statement, its fields (to edit here from the
 * tablet breakpoint up, in a sheet on a phone) and, for an assumption, its evidence. Its ⋯
 * is the row's (Reorder, Delete), within reach where the detail takes a phone's screen.
 */
function RowDetail({
  ideaId,
  validationId,
  tab,
  row,
  canEdit,
  onReorder,
  onDelete,
  onOpenEvidence,
}: {
  ideaId: string;
  validationId: string;
  tab: AssumptionsTab;
  row: Row;
  canEdit: boolean;
  onReorder: () => void;
  onDelete: () => void;
  onOpenEvidence: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  const panel = usePanel();
  const isPhone = useIsNarrow();
  const [isEditing, setEditing] = useState(false);
  const type = typeOf[tab];
  const rowItem = {
    kind: "item",
    item: { type, id: row.id, key: null },
  } as const;
  return (
    <Stack gap="space-400">
      <Flex justifyContent="space-between" alignItems="start" gap="space-200">
        <Heading level={2}>{row.statement}</Heading>
        <Flex gap="space-50" alignItems="center" shrink={false}>
          <ItemCommentsButton
            label={rowLabel(type, row.statement)}
            count={row.commentCount}
            onPress={() => panel.show("comments", rowItem)}
          />
          <ItemHistoryButton
            label={rowLabel(type, row.statement)}
            onPress={() => panel.show("history", rowItem)}
          />
          {canEdit && (
            <ActionMenu
              aria-label={t("validation:assumptions.more", {
                statement: row.statement,
              })}
              onAction={(key) => {
                if (key === "reorder") onReorder();
                if (key === "delete") onDelete();
              }}
            >
              <MenuItem id="reorder">
                {t("validation:assumptions.reorder")}
              </MenuItem>
              <MenuItem id="delete">
                {t("validation:assumptions.delete")}
              </MenuItem>
            </ActionMenu>
          )}
        </Flex>
      </Flex>
      {canEdit && !isPhone ? (
        <RowEditor
          ideaId={ideaId}
          validationId={validationId}
          tab={tab}
          row={row}
          onOpenEvidence={onOpenEvidence}
        />
      ) : (
        <Stack gap="space-200">
          <RowFacts tab={tab} row={row} />
          {canEdit && (
            <Flex>
              <Button variant="secondary" onPress={() => setEditing(true)}>
                {t("validation:assumptions.edit")}
              </Button>
            </Flex>
          )}
        </Stack>
      )}
      {/* Only an editor opens it; once open it stays until closed, though the screen
          read again no longer lets them edit, so a refused save shows in it
          (design-spec 6.0.6's modals). */}
      {isEditing && (
        <Dialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditing(false);
          }}
          isDismissable
          size="M"
          title={t(`validation:assumptions.editTitle.${tab}`)}
        >
          <RowEditor
            ideaId={ideaId}
            validationId={validationId}
            tab={tab}
            row={row}
            autoFocus
            onOpenEvidence={canEdit ? onOpenEvidence : undefined}
          />
        </Dialog>
      )}
    </Stack>
  );
}

/**
 * A new row (design-spec 6.10「+ Add」): its fields, then Add, which makes it and shows it.
 * In the detail's place from the tablet breakpoint up, in a sheet on a phone; failures,
 * and a send that fails once the form is closed (in a toast, 6.0.6), as 14's new entry.
 */
function NewRow({
  ideaId,
  validationId,
  tab,
  isSheet,
  isReadOnly,
  onCreated,
  onCancel,
}: {
  ideaId: string;
  validationId: string;
  tab: AssumptionsTab;
  isSheet: boolean;
  /** The screen read again no longer lets the user add one: what was typed stays, unsent. */
  isReadOnly: boolean;
  onCreated: (row: Row) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["validation", "errors"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const spec = formOf[tab].spec as RowFieldsSpec<AssumptionValues | RiskValues>;
  const [values, setValues] = useState<AssumptionValues | RiskValues>(
    formOf[tab].empty,
  );
  // A field's reason shows once it changed, as 14's new entry.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const latestOnCreated = useRef(onCreated);
  latestOnCreated.current = onCreated;
  const oneAtATime = useOneAtATime();
  const readAgainWhenRefused = useReadAgainWhenRefused();
  const sendThrough = useSendThrough();
  const post = async (input: AssumptionValues | RiskValues): Promise<Row> => {
    const lists = api().api.v1.validations({
      validationId: inPath(validationId),
    });
    return tab === "assumptions"
      ? unwrap(lists.assumptions.post(input as AssumptionValues))
      : unwrap(lists.risks.post(input as RiskValues));
  };
  const readAgain = () =>
    queryClient.invalidateQueries({ queryKey: ideaKey(ideaId) });
  const failOnceClosed = useFailureOnceClosed(
    async (input: AssumptionValues | RiskValues) => {
      await sendThrough(() => post(input));
      await readAgain();
    },
  );
  const create = useMutation({
    mutationFn: post,
    onSuccess: () => void readAgain(),
    onError: failOnceClosed,
  });
  const failure = create.error;
  // Refused for good, the form sends no more (design-spec 6.10): at once, before the
  // screen read again shows why, and also where that read changes nothing (gone).
  const isLocked = isReadOnly || isRefusedForGood(failure);
  const fields = Object.keys(values) as (keyof typeof values & string)[];
  const refusedFields = refusedFieldsOf(failure, fields);
  const errors = Object.fromEntries(
    fields.flatMap((field) => {
      const error =
        touched[field] === true
          ? spec.errorOf(field, values[field])
          : undefined;
      const shown =
        error ??
        (refusedFields.includes(field) ? t("errors:input.format") : undefined);
      return shown === undefined ? [] : [[field, shown]];
    }),
  );
  const canSubmit = isOnline && !isLocked && isRowValid(spec, values);
  const submit = () =>
    void oneAtATime(
      () =>
        new Promise<void>((resolve) => {
          create.mutate(values, {
            // Fires only while the form is still open: Cancel or leaving meanwhile keeps
            // the user where they went (the row is made all the same).
            onSuccess: (row) => latestOnCreated.current(row),
            // As does this. Once the form is closed, its toast reads the screen again.
            onError: readAgainWhenRefused,
            onSettled: () => resolve(),
          });
        }),
    );
  const change = (field: string, value: unknown) => {
    if ((refusedFields as string[]).includes(field)) create.reset();
    setValues((current) => ({ ...current, [field]: value }));
    setTouched((current) => ({ ...current, [field]: true }));
  };
  const form = (
    <Stack gap="space-300">
      {tab === "assumptions" ? (
        <AssumptionFields
          values={values as AssumptionValues}
          errors={errors}
          onChange={change}
          isReadOnly={!isOnline || isLocked}
          autoFocus
        />
      ) : (
        <RiskFields
          values={values as RiskValues}
          errors={errors}
          onChange={change}
          isReadOnly={!isOnline || isLocked}
          autoFocus
        />
      )}
      {failure !== null && (
        <SendFailure
          error={failure}
          transient="couldNotSave"
          withSaveReasons
          onRetry={submit}
          isRetryDisabled={!canSubmit}
        />
      )}
    </Stack>
  );
  const buttons = (
    <ButtonGroup align="end">
      <Button variant="secondary" onPress={onCancel}>
        {t("validation:assumptions.cancel")}
      </Button>
      <Button
        variant="primary"
        onPress={submit}
        isDisabled={!canSubmit}
        isPending={create.isPending}
      >
        {t(`validation:assumptions.add.${tab}`)}
      </Button>
    </ButtonGroup>
  );
  if (isSheet) {
    return (
      <Dialog
        isOpen
        onOpenChange={(isOpen) => {
          if (!isOpen) onCancel();
        }}
        size="M"
        title={t(`validation:assumptions.newTitle.${tab}`)}
        buttons={buttons}
      >
        {form}
      </Dialog>
    );
  }
  return (
    <Stack gap="space-400">
      <Heading level={2}>{t(`validation:assumptions.newTitle.${tab}`)}</Heading>
      {form}
      {buttons}
    </Stack>
  );
}

/** A row of the list: its statement, then its level and its evidence. */
function RowLine({ tab, row }: { tab: AssumptionsTab; row: Row }) {
  const { t } = useTranslation(["validation", "common", "app"]);
  const levelOf = (value: Confidence | null) =>
    value === null ? null : t(`common:confidence.${value}`);
  const parts: (string | null)[] = [];
  if (tab === "assumptions") {
    const assumption = row as Assumption;
    const confidence = levelOf(assumption.confidence);
    const count = countingEvidence(assumption.evidence).length;
    parts.push(
      confidence === null
        ? null
        : t("validation:assumptions.confidenceLevel", { confidence }),
      count === 0 ? null : t("validation:rows.sources", { count }),
    );
  } else {
    const risk = row as Risk;
    const impact = levelOf(risk.impact);
    const probability = levelOf(risk.probability);
    parts.push(
      impact === null
        ? null
        : t("validation:assumptions.impactLevel", { level: impact }),
      probability === null
        ? null
        : t("validation:assumptions.probabilityLevel", { level: probability }),
    );
  }
  const meta = parts.filter((part) => part !== null);
  return (
    <Stack gap="space-50">
      <Text variant="label">{row.statement}</Text>
      {(meta.length > 0 || row.commentCount > 0) && (
        <Flex gap="space-200" alignItems="center">
          {meta.length > 0 && (
            <Text variant="caption" tone="secondary">
              {meta.join(t("app:separator"))}
            </Text>
          )}
          <Text variant="caption" tone="secondary">
            <CommentCount count={row.commentCount} />
          </Text>
        </Flex>
      )}
    </Stack>
  );
}

function AssumptionsBody({
  home,
  isDecided,
  search,
  modal,
  about,
  onSearch,
  onOpen,
  onClose,
}: {
  home: ValidationHome;
  /** `home` has been read and is not being read again: whether the idea is archived. */
  isDecided: boolean;
  search: AssumptionsSearch;
  modal: string | undefined;
  about: string | undefined;
  /** Replaces the URL's search: the tab, and what is beside the list. */
  onSearch: (next: AssumptionsSearch) => void;
  /** Shows a row or a new one in place of the list (one pane): Back returns to it. */
  onOpen: (next: AssumptionsSearch) => void;
  /** Leaves what `onOpen` showed for `next`, going back if it was opened here. */
  onClose: (next: AssumptionsSearch) => void;
}) {
  const toastFailure = useToastFailure();
  const { t } = useTranslation(["validation", "common"]);
  const { me, role } = useWorkspace();
  const queryClient = useQueryClient();
  const modals = useModal();
  const isTwoColumns = useTwoColumns();
  const isPhone = useIsNarrow();
  const { idea, validationId } = home;
  const canEdit = role !== "viewer" && !idea.archived;
  const tab = search.tab ?? "assumptions";
  const assumptions = useQuery(assumptionsQuery(idea.id, validationId));
  const risks = useQuery(risksQuery(idea.id, validationId));
  const query = tab === "assumptions" ? assumptions : risks;
  const listKey = listOf(idea.id, validationId, tab).queryKey;
  const { isSlow, retry: retrySlow } = useSlowLoading(query.isPending, [
    { queryKey: listKey },
  ]);
  const [isReordering, setReordering] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const items: Row[] = query.data?.items ?? [];
  // `new=1` opens the new row as 14's opens its new entry (SDD 4章, design-spec 6.10).
  const isNew = useAskedOpen(search.new === 1, canEdit, isDecided, {
    search: ({ new: _, ...rest }) => rest,
  });
  const shownFirst =
    search.row === undefined && isTwoColumns && !isNew
      ? items[0]?.id
      : undefined;
  const kept = useKeepShownItem(isTwoColumns, shownFirst, search.row, (row) =>
    onSearch({ ...search, row }),
  );
  const selected = search.row ?? shownFirst ?? kept;

  // What the screen shows when a delete settles, which may be later: a user who left or
  // moved on meanwhile is not taken back to the list.
  const latest = useRef({ search, onClose, isOpen: true });
  latest.current = { search, onClose, isOpen: true };
  useEffect(() => {
    latest.current.isOpen = true;
    return () => {
      latest.current.isOpen = false;
    };
  }, []);
  const remove = useMutation({
    mutationFn: ({ tab: list, id }: { tab: AssumptionsTab; id: string }) =>
      list === "assumptions"
        ? unwrap(
            api()
              .api.v1.assumptions({ id: inPath(id) })
              .delete({}),
          )
        : unwrap(
            api()
              .api.v1.risks({ id: inPath(id) })
              .delete({}),
          ),
    onSettled: (_data, error, { tab: list, id }) => {
      // Deleted, here or already elsewhere (V11 answers 404 for a deleted row).
      if (
        error !== null &&
        !(error instanceof ApiError && error.code === "NOT_FOUND")
      ) {
        toastFailure(error, () => remove.mutate({ tab: list, id }));
        return;
      }
      putSaved<{ items: Row[] }>(
        queryClient,
        listOf(idea.id, validationId, list).queryKey,
        (data) =>
          data === undefined
            ? undefined
            : { items: data.items.filter((row) => row.id !== id) },
      );
      void queryClient.invalidateQueries({ queryKey: ideaKey(idea.id) });
      // Its detail closes only while 16 is open and the row is still the one shown.
      const { search: now, onClose: close, isOpen } = latest.current;
      if (isOpen && (now.tab ?? "assumptions") === list && now.row === id) {
        close({ ...now, row: undefined });
      }
    },
  });

  const openNew = () => {
    const next = { ...search, row: undefined, new: 1 as const };
    // Beside the list it takes the detail's place, as a chosen row does.
    if (isTwoColumns) onSearch(next);
    else onOpen(next);
  };
  const closeNew = () => onClose({ ...search, new: undefined });
  const openEvidence = (row: Row) =>
    modals.open("evidence", { about: aboutOf(row.id) });

  const listFor = (list: AssumptionsTab): ReactNode => {
    const data = list === "assumptions" ? assumptions : risks;
    // A read again that failed leaves what was read on screen (as 13 does): only a list
    // never read shows the failure.
    if (data.data === undefined) {
      if (data.isError) {
        return (
          <FailureState
            error={data.error}
            onRetry={() => void data.refetch()}
            dashboardHref={dashboardHref(me)}
            headingLevel={2}
            size="S"
          />
        );
      }
      return isSlow ? (
        <SlowLoadingState headingLevel={2} size="S" onRetry={retrySlow} />
      ) : (
        <ListSkeleton />
      );
    }
    const rows: Row[] = data.data.items;
    if (rows.length === 0) {
      return (
        <IllustratedMessage
          headingLevel={2}
          size="S"
          icon={list === "assumptions" ? <ListChecks /> : <ShieldAlert />}
          heading={t(`validation:assumptions.empty.${list}`)}
          actions={
            canEdit ? (
              <Button variant="primary" onPress={openNew}>
                {t(`validation:assumptions.add.${list}`)}
              </Button>
            ) : undefined
          }
        />
      );
    }
    return (
      <ListView
        aria-label={t(`validation:assumptions.tab.${list}`)}
        items={rows}
        selectionMode="single"
        selectedKeys={selected === undefined || isNew ? [] : [selected]}
        dependencies={[canEdit]}
        // Pressing the chosen row again keeps it: the detail never goes blank.
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key === undefined) return;
          const next = { ...search, row: String(key), new: undefined };
          if (isTwoColumns) onSearch(next);
          else onOpen(next);
        }}
      >
        {(row) => (
          <ListViewItem
            id={row.id}
            textValue={row.statement}
            actions={
              canEdit ? (
                <ActionMenu
                  aria-label={t("validation:assumptions.more", {
                    statement: row.statement,
                  })}
                  onAction={(key) => {
                    if (key === "reorder") setReordering(true);
                    if (key === "delete") setDeleting(row);
                  }}
                >
                  <MenuItem id="reorder">
                    {t("validation:assumptions.reorder")}
                  </MenuItem>
                  <MenuItem id="delete">
                    {t("validation:assumptions.delete")}
                  </MenuItem>
                </ActionMenu>
              ) : undefined
            }
          >
            <RowLine tab={list} row={row} />
          </ListViewItem>
        )}
      </ListView>
    );
  };

  const newRow = (isSheet: boolean) => (
    <NewRow
      // Each list's form is its own.
      key={tab}
      ideaId={idea.id}
      validationId={validationId}
      tab={tab}
      isSheet={isSheet}
      isReadOnly={!canEdit}
      onCreated={(row) => {
        // In the list before it is shown: no "Not found" while the list is read again.
        putRow(queryClient, idea.id, validationId, tab, row);
        onSearch({ ...search, row: row.id, new: undefined });
      }}
      onCancel={closeNew}
    />
  );
  const shown =
    selected === undefined
      ? undefined
      : items.find(({ id }) => id === selected);
  const detail =
    isNew && !isPhone ? (
      newRow(false)
    ) : selected === undefined ? null : shown === undefined ? (
      // Decided once the list is read again, not while.
      query.data === undefined || query.isFetching ? null : (
        // A row deleted, of the other list, or of another idea (6.0.6).
        <NotFoundState
          dashboardHref={dashboardHref(me)}
          headingLevel={2}
          size="S"
        />
      )
    ) : (
      <RowDetail
        key={`${tab}:${shown.id}`}
        ideaId={idea.id}
        validationId={validationId}
        tab={tab}
        row={shown}
        canEdit={canEdit}
        onReorder={() => setReordering(true)}
        onDelete={() => setDeleting(shown)}
        onOpenEvidence={() => openEvidence(shown)}
      />
    );

  const isEvidenceDecided = useIsValidationRead(idea.id, assumptions);
  // M2 is an assumption's alone: a risk takes no evidence (design-spec 6.10).
  const aboutRow = assumptions.data?.items.find(
    ({ id }) => aboutOf(id) === about,
  );
  const evidenceRow = useSearchModalAbout(
    modal,
    "evidence",
    aboutRow,
    canEdit,
    isEvidenceDecided,
  );
  // Open on an assumption no longer listed (deleted meanwhile), M2 stays with it as it was.
  const isEvidenceGone = evidenceRow !== undefined && aboutRow === undefined;
  const title =
    home.sections.find(({ key }) => key === "09")?.title ??
    t("validation:assumptions.title");

  return (
    <>
      <ListDetailPattern
        header={
          <Stack gap="space-200">
            {idea.archived && <ArchivedIdeaAlert ideaId={idea.id} />}
            <SectionTitle
              ideaId={idea.id}
              sections={home.sections}
              title={title}
              variant="heading-1-list"
            />
          </Stack>
        }
        newItem={
          canEdit
            ? {
                label: t(`validation:assumptions.add.${tab}`),
                onPress: openNew,
              }
            : undefined
        }
        tabs={{
          "aria-label": t("validation:assumptions.tabs"),
          items: (["assumptions", "risks"] as const).map((id) => ({
            id,
            label: t(`validation:assumptions.tab.${id}`),
          })),
          selectedKey: tab,
          onSelectionChange: (key) =>
            onSearch({
              tab: key === "risks" ? "risks" : "assumptions",
              row: undefined,
              new: undefined,
            }),
        }}
        list={listFor(tab)}
        detail={detail}
        listLabel={t(`validation:assumptions.tab.${tab}`)}
        onBack={() => onClose({ ...search, row: undefined, new: undefined })}
      />
      {isNew && isPhone && newRow(true)}
      {/* Opened from an editor's ⋯; once open it stays until closed, so a refused
          Save order shows in it (design-spec 6.0.6's modals). */}
      {isReordering && (
        <ReorderDialog
          title={t(`validation:assumptions.reorderTitle.${tab}`)}
          items={items.map(({ id, statement }) => ({ id, label: statement }))}
          send={async (ids) => {
            const lists = api().api.v1.validations({
              validationId: inPath(validationId),
            });
            await unwrap(
              tab === "assumptions"
                ? lists.assumptions.order.put({ ids })
                : lists.risks.order.put({ ids }),
            );
            // In the new order at once; risks keep it by hand from now on (V17).
            putSaved<{ items: Row[] }>(queryClient, listKey, (data) =>
              data === undefined
                ? undefined
                : {
                    items: ids.flatMap((id, index) => {
                      const row = data.items.find((item) => item.id === id);
                      return row === undefined
                        ? []
                        : [{ ...row, sortOrder: index } as Row];
                    }),
                  },
            );
          }}
          reload={async () => {
            const rows: Row[] = (
              tab === "assumptions"
                ? await queryClient.fetchQuery({
                    ...assumptionsQuery(idea.id, validationId),
                    staleTime: 0,
                  })
                : await queryClient.fetchQuery({
                    ...risksQuery(idea.id, validationId),
                    staleTime: 0,
                  })
            ).items;
            return rows.map(({ id, statement }) => ({
              id,
              label: statement,
            }));
          }}
          onClose={() => setReordering(false)}
        />
      )}
      {deleting !== null && (
        <DeleteRowQuestion
          tab={tab}
          onDelete={() => remove.mutate({ tab, id: deleting.id })}
          onClose={() => setDeleting(null)}
        />
      )}
      {evidenceRow !== undefined && (
        <ModalBoundary key="evidence" onClose={modals.close}>
          <RowEvidenceSheet
            ideaId={idea.id}
            validationId={validationId}
            type="assumption"
            rowId={evidenceRow.id}
            label={t("common:itemLabel.row", {
              list: t("common:itemLabel.list.assumption"),
              text: evidenceRow.statement,
            })}
            noun={t("validation:assumptions.noun.assumptions")}
            evidence={evidenceRow.evidence}
            lockVersionNow={() =>
              queryClient
                .getQueryData(assumptionsQuery(idea.id, validationId).queryKey)
                ?.items.find(({ id }) => id === evidenceRow.id)?.lockVersion ??
              evidenceRow.lockVersion
            }
            saveKey={rowKey("assumptions", evidenceRow.id)}
            onChanged={(change) =>
              putRow(queryClient, idea.id, validationId, "assumptions", {
                id: evidenceRow.id,
                ...change,
              })
            }
            onReload={() =>
              void queryClient.invalidateQueries({
                queryKey: assumptionsQuery(idea.id, validationId).queryKey,
              })
            }
            isGone={isEvidenceGone}
            onClose={modals.close}
          />
        </ModalBoundary>
      )}
    </>
  );
}

/**
 * 16 Assumptions & Risks (design-spec 6.10): pattern D with the two lists in tabs. The
 * assumptions in their order and the risks highest Impact then Probability first, until
 * reordered by hand; the selected row beside them, edited there (in a sheet on a phone);
 * + Add; Reorder and Delete in a row's ⋯; an assumption's evidence through M2. Viewers and
 * archived ideas read only.
 */
export function AssumptionsScreen({
  ideaId,
  search,
  modal,
  about,
}: {
  ideaId: string;
  search: AssumptionsSearch;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["ideas", "validation"]);
  const { me, workspace } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const panel = usePanel();
  const homeOptions = validationHomeQuery(ideaId);
  const home = useQuery(homeOptions);
  const { isSlow, retry: retrySlow } = useSlowLoading(home.isPending, [
    homeOptions,
  ]);
  const data =
    home.data?.idea.workspaceId === workspace.id ? home.data : undefined;
  const title = data?.sections.find(({ key }) => key === "09")?.title;
  // The body reads the same lists: the panel names the rows by their statements.
  const assumptions = useQuery({
    ...assumptionsQuery(ideaId, data?.validationId ?? ""),
    enabled: data !== undefined,
  });
  const risks = useQuery({
    ...risksQuery(ideaId, data?.validationId ?? ""),
    enabled: data !== undefined,
  });
  const comments: ScreenComments | undefined =
    data === undefined
      ? undefined
      : {
          screen: {
            containerType: "validation",
            containerId: data.validationId,
            sectionKeys: ["assumptions_risks"],
          },
          idea: {
            id: ideaId,
            name: data.idea.name,
            archived: data.idea.archived,
          },
          dataKey: ideaKey(ideaId),
          shows: (item) => {
            if (item.type !== "assumption" && item.type !== "risk") {
              return false;
            }
            const rows = (item.type === "assumption" ? assumptions : risks).data
              ?.items;
            return (
              item.key == null &&
              (rows === undefined || rows.some(({ id }) => id === item.id))
            );
          },
          labelOf: (target) => {
            if (target.type === "idea") return data.idea.name;
            const rows: readonly Row[] =
              (target.type === "assumption" ? assumptions.data : risks.data)
                ?.items ?? [];
            const row = rows.find(({ id }) => id === target.id);
            return row === undefined
              ? undefined
              : rowLabel(
                  target.type === "assumption" ? "assumption" : "risk",
                  row.statement,
                );
          },
        };
  useDocumentTitle(
    ...(data === undefined || title === undefined
      ? []
      : [title, workspace.name]),
  );
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedDetail === true,
  });
  const to = (next: AssumptionsSearch, replace: boolean) =>
    void navigate({
      href: panel.keep(assumptionsHref(workspace.id, ideaId, next)),
      replace,
      // Replacing keeps how the row was reached: a new row made in a pushed form still
      // goes back to the list.
      state: (previous) =>
        replace ? previous : { ...previous, openedDetail: true },
    });

  let body: ReactNode;
  if (home.data !== undefined && data === undefined) {
    // Another workspace's idea under this one's URL (SDD 4章).
    body = <NoAccessState dashboardHref={dashboardHref(me)} />;
  } else if (data !== undefined) {
    body = (
      <AssumptionsBody
        home={data}
        isDecided={!home.isFetching}
        search={search}
        modal={modal}
        about={about}
        // The tab and what is beside the list replace the row: Back leaves the screen.
        onSearch={(next) => to(next, true)}
        onOpen={(next) => to(next, false)}
        onClose={(next) => {
          if (openedHere) router.history.back();
          else to(next, true);
        }}
      />
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
    body = <SlowLoadingState onRetry={retrySlow} />;
  } else {
    body = <AssumptionsSkeleton />;
  }
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope={["assumption:", "risk:"]}
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
