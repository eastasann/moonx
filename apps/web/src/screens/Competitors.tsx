import { hasText } from "@moonx/domain";
import { formatMoney } from "@moonx/i18n";
import type {
  CheckState,
  Competitor,
  competitorListSchema,
  ValidationHome,
} from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Breadcrumb,
  Breadcrumbs,
  Button,
  ButtonGroup,
  Card,
  CardComparePattern,
  CardView,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Heading,
  IllustratedMessage,
  MenuItem,
  MoonGlyph,
  QuestionCard,
  QuestionList,
  QuestionListItem,
  Skeleton,
  Stack,
  TableView,
  Text,
  useFauLabel,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Plus, Swords } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import {
  AnswerEvidenceSheet,
  AnswerFields,
  type Answers,
  type AnswersCache,
  answerKey,
  moonOf,
  useAnswers,
} from "../components/AnswerFields";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  COMPETITOR_TEXTS,
  CompetitorFields,
  competitorInput,
  competitorSpec,
  competitorValues,
  newCompetitorValues,
} from "../components/CompetitorFields";
import { ModalBoundary } from "../components/ErrorBoundary";
import { toastFailure } from "../components/ideaActions";
import { dotState } from "../components/ideaParts";
import { ModalSendFailure } from "../components/ModalFailure";
import { ReorderDialog } from "../components/ReorderDialog";
import { RowEvidence, RowEvidenceSheet } from "../components/RowEvidence";
import { isRowValid, useRowFields } from "../components/RowFields";
import { SaveFailureNote } from "../components/SaveFeedback";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useModal, useWorkspace } from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import type { SaveTarget } from "../lib/autosave";
import { useAutosave } from "../lib/autosave-react";
import { countingEvidence } from "../lib/evidence";
import { useOneAtATime } from "../lib/form";
import {
  type CompetitorsSearch,
  competitorsHref,
  ideaHref,
  ideasHref,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  competitorsQuery,
  ideaKey,
  putSaved,
  validationHomeQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

export type { CompetitorsSearch };

type CompetitorList = z.infer<typeof competitorListSchema>;

/** The page's save of a competitor (design-spec 6.0.2's item "1つの行"). */
const competitorKey = (competitorId: string) => `competitor:${competitorId}`;

/** M2's `about` for a competitor (SDD 4章). */
const aboutOf = (competitorId: string) => `competitor:${competitorId}`;

/** Puts a competitor, as saved, in 15's list: in its place, or last when it is new. */
function putCompetitor(
  queryClient: QueryClient,
  listKey: CompetitorListKey,
  competitor: Partial<Competitor> & { id: string },
) {
  putSaved<CompetitorList>(queryClient, listKey, (data) => {
    if (data === undefined) return undefined;
    const isListed = data.items.some(({ id }) => id === competitor.id);
    return {
      ...data,
      items: isListed
        ? data.items.map((current) =>
            current.id === competitor.id
              ? { ...current, ...competitor }
              : current,
          )
        : [...data.items, competitor as Competitor],
    };
  });
}

type CompetitorListKey = ReturnType<typeof competitorsQuery>["queryKey"];

/** The save of a competitor's fields (V9 PATCH). */
function competitorTarget(
  queryClient: QueryClient,
  ideaId: string,
  listKey: CompetitorListKey,
  competitorId: string,
  noun: string,
): SaveTarget {
  return {
    key: competitorKey(competitorId),
    noun,
    send: async (fields, lockVersion, force) => {
      const competitor = await unwrap(
        api()
          .api.v1.competitors({ competitorId: inPath(competitorId) })
          .patch({ ...fields, lockVersion, ...(force ? { force } : {}) }),
      );
      putCompetitor(queryClient, listKey, competitor);
      // 13's checks count the competitors and their prices.
      void queryClient.invalidateQueries({
        queryKey: validationHomeQuery(ideaId).queryKey,
        refetchType: "none",
      });
      return competitor.lockVersion;
    },
    // Their version carries its evidence by id only (the history's shape): the list is
    // read again for the whole competitor.
    loadTheirs: () => void queryClient.invalidateQueries({ queryKey: listKey }),
  };
}

/** "3–5", or "7+" past the fixed upper guide (design-spec 6.1's check 1). */
function useRange(guidance: CompetitorList["guidance"]) {
  const { t } = useTranslation(["validation"]);
  return guidance.min < guidance.max
    ? t("validation:home.sections.range", guidance)
    : t("validation:home.sections.rangeAtLeast", guidance);
}

/** Check 1's state for this many competitors (design-spec 6.1). */
const checkStateOf = (count: number, min: number): CheckState =>
  count >= min ? "done" : count > 0 ? "partial" : "not_started";

/** A competitor's price ("₱240"), with cents only where it has them. */
const priceText = (price: number, currency: string) =>
  formatMoney(price, currency, { cents: !Number.isInteger(price) });

/** "1 source", "No sources": the evidence that counts (6.0.3). */
function useSources() {
  const { t } = useTranslation(["validation"]);
  return (competitor: Competitor) => {
    const count = countingEvidence(competitor.evidence).length;
    return count === 0
      ? t("validation:rows.noSources")
      : t("validation:rows.sources", { count });
  };
}

/**
 * A competitor's fields saved as they are typed (design-spec 6.0.2, the row its item), its
 * evidence with Add evidence (M2), and its save's failure.
 */
function CompetitorEditor({
  ideaId,
  listKey,
  competitor,
  onOpenEvidence,
}: {
  ideaId: string;
  listKey: CompetitorListKey;
  competitor: Competitor;
  onOpenEvidence: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const target = competitorTarget(
    queryClient,
    ideaId,
    listKey,
    competitor.id,
    t("validation:competitors.noun"),
  );
  const row = useRowFields(
    target,
    competitor.lockVersion,
    competitorValues(competitor),
    competitorSpec,
  );
  return (
    <Stack gap="space-300">
      <SaveFailureNote itemKey={target.key} />
      <CompetitorFields
        values={row.values}
        errors={row.errors}
        onChange={row.change}
        onBlur={row.blur}
        currency={workspace.currency}
        isReadOnly={!isOnline}
        evidence={
          <RowEvidence evidence={competitor.evidence} onAdd={onOpenEvidence} />
        }
      />
    </Stack>
  );
}

/** A competitor to read (a Viewer, an archived idea): its fields and evidence. */
function CompetitorFacts({ competitor }: { competitor: Competitor }) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  const empty = <Text tone="secondary">{t("validation:rows.empty")}</Text>;
  const text = (value: string | null) => (hasText(value) ? value : empty);
  return (
    <Stack gap="space-400">
      <DescriptionList>
        <DescriptionListItem label={t("validation:competitors.field.type")}>
          {competitor.type === null
            ? empty
            : t(`common:competitorType.${competitor.type}`)}
        </DescriptionListItem>
        {COMPETITOR_TEXTS.slice(0, 2).map((field) => (
          <DescriptionListItem
            key={field}
            label={t(`validation:competitors.field.${field}`)}
          >
            {text(competitor[field])}
          </DescriptionListItem>
        ))}
        <DescriptionListItem
          label={t("validation:competitors.field.typicalPrice")}
        >
          {competitor.typicalPrice === null
            ? empty
            : priceText(competitor.typicalPrice, workspace.currency)}
        </DescriptionListItem>
        <DescriptionListItem
          label={t("validation:competitors.field.priceNote")}
        >
          {text(competitor.priceNote)}
        </DescriptionListItem>
        {COMPETITOR_TEXTS.slice(2).map((field) => (
          <DescriptionListItem
            key={field}
            label={t(`validation:competitors.field.${field}`)}
          >
            {text(competitor[field])}
          </DescriptionListItem>
        ))}
      </DescriptionList>
      <RowEvidence evidence={competitor.evidence} />
    </Stack>
  );
}

/**
 * A new competitor (design-spec 6.10「+ Add competitor」): a large dialog, a full sheet on
 * a phone, with the fields, Cancel and Add competitor. Adding hands the competitor to the
 * screen, which opens its own dialog, where evidence is attached (M2 needs the
 * competitor). A failure keeps what was typed, as a modal's does (6.0.6).
 */
function NewCompetitorDialog({
  ideaId,
  validationId,
  onCreated,
  onClose,
}: {
  ideaId: string;
  validationId: string;
  onCreated: (competitor: Competitor) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation", "errors"]);
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const [values, setValues] = useState(newCompetitorValues);
  // A field's reason shows once it changed, as 14's new entry.
  const [touched, setTouched] = useState<
    Partial<Record<keyof typeof values, boolean>>
  >({});
  const latestOnCreated = useRef(onCreated);
  latestOnCreated.current = onCreated;
  const oneAtATime = useOneAtATime();
  const create = useMutation({
    mutationFn: (input: typeof values) =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .competitors.post(competitorInput(input)),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ideaKey(ideaId) }),
  });
  // A 422 naming a field (SDD 8.2's last guard) puts "Check the format" under it.
  const failure = create.error;
  const details =
    failure instanceof ApiError && failure.code === "VALIDATION_FAILED"
      ? failure.detail.details
      : undefined;
  const fields = Object.keys(values) as (keyof typeof values)[];
  const refusedFields = fields.filter(
    (field) =>
      Array.isArray(details) &&
      (details as { path?: unknown }[]).some(({ path }) => path === field),
  );
  const errors = Object.fromEntries(
    fields.flatMap((field) => {
      const error =
        touched[field] === true
          ? competitorSpec.errorOf(field, values[field])
          : undefined;
      const shown =
        error ??
        (refusedFields.includes(field) ? t("errors:input.format") : undefined);
      return shown === undefined ? [] : [[field, shown]];
    }),
  );
  const canSubmit = isOnline && isRowValid(competitorSpec, values);
  const submit = () =>
    void oneAtATime(
      () =>
        new Promise<void>((resolve) => {
          create.mutate(values, {
            // Fires only while the dialog is still open: Cancel meanwhile keeps the user
            // where they are (the competitor is made all the same).
            onSuccess: (competitor) => latestOnCreated.current(competitor),
            onSettled: () => resolve(),
          });
        }),
    );
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      size="L"
      title={t("validation:competitors.newTitle")}
      buttons={
        <ButtonGroup align="end">
          <Button variant="secondary" onPress={onClose}>
            {t("validation:competitors.cancel")}
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            isDisabled={!canSubmit}
            isPending={create.isPending}
          >
            {t("validation:competitors.add")}
          </Button>
        </ButtonGroup>
      }
    >
      <Stack gap="space-300">
        <CompetitorFields
          values={values}
          errors={errors}
          currency={workspace.currency}
          isReadOnly={!isOnline}
          autoFocus
          onChange={(field, value) => {
            if (refusedFields.includes(field)) create.reset();
            setValues((current) => ({ ...current, [field]: value }));
            setTouched((current) => ({ ...current, [field]: true }));
          }}
        />
        {failure !== null && refusedFields.length === 0 && (
          <ModalSendFailure
            error={failure}
            onRetry={submit}
            isRetryDisabled={!canSubmit}
            onClose={onClose}
          />
        )}
      </Stack>
    </Dialog>
  );
}

/** The question before a competitor is deleted (design-spec 6.10「14〜16 共通」). */
function DeleteCompetitorQuestion({
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
      title={t("validation:competitors.deleteTitle")}
      primaryActionLabel={t("validation:competitors.delete")}
      cancelLabel={t("validation:competitors.cancel")}
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

/** The fields the comparison table sets in rows (design-spec 6.10「表で比較」). */
const COMPARED = ["type", "price", ...COMPETITOR_TEXTS, "sources"] as const;

/**
 * "Table": the fields as rows and the competitors as columns, to compare them
 * (design-spec 6.10, s15-competitors.html). Read only: a card opens a competitor.
 */
function CompareTable({ items }: { items: readonly Competitor[] }) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  const sources = useSources();
  const empty = (
    <Text variant="body-sm" tone="tertiary">
      {t("validation:rows.empty")}
    </Text>
  );
  const rows = COMPARED.map((field) => ({
    id: field,
    name:
      field === "type" || field === "price" || field === "sources"
        ? t(`validation:competitors.compare.${field}`)
        : t(`validation:competitors.card.${field}`),
  }));
  return (
    <TableView
      aria-label={t("validation:competitors.table")}
      columns={[
        {
          id: "field",
          name: t("validation:competitors.compare.field"),
          isRowHeader: true,
        },
        ...items.map((competitor) => ({
          id: competitor.id,
          name: competitor.name,
        })),
      ]}
      items={rows}
      renderCell={(row, column) => {
        if (column === "field") return row.name;
        const competitor = items.find(({ id }) => id === column);
        if (competitor === undefined) return null;
        switch (row.id) {
          case "type":
            return competitor.type === null
              ? empty
              : t(`common:competitorType.${competitor.type}`);
          case "price":
            return competitor.typicalPrice === null ? (
              <Text variant="body-sm" tone="tertiary">
                {t("validation:competitors.noPrice")}
              </Text>
            ) : (
              [
                priceText(competitor.typicalPrice, workspace.currency),
                competitor.priceNote,
              ]
                .filter((part) => hasText(part))
                .join(" ")
            );
          case "sources":
            return sources(competitor);
          default:
            return hasText(competitor[row.id]) ? competitor[row.id] : empty;
        }
      }}
    />
  );
}

/** The element of a pattern question, for `?q=` to focus. */
const patternId = (questionKey: string) => `pattern-${questionKey}`;

/**
 * Survivor Patterns and Failure Patterns under the cards (design-spec 6.10): the
 * template's two questions, answered as on 11 (F/A/U, EXAMPLE and Hint open on the one
 * being answered). A `?q=` focuses its question.
 */
function PatternQuestions({
  home,
  patterns,
  answers,
  focusKey,
  canEdit,
}: {
  home: ValidationHome;
  patterns: CompetitorList["patterns"];
  answers: Answers;
  focusKey: string | undefined;
  canEdit: boolean;
}) {
  const { t } = useTranslation(["validation"]);
  const autosave = useAutosave();
  const fauLabel = useFauLabel();
  const { idea, validationId } = home;
  const [current, setCurrent] = useState<string | null>(() =>
    patterns.some(({ question }) => question.key === focusKey)
      ? (focusKey ?? null)
      : null,
  );

  // A `?q=` focuses its question, on opening and when it changes later (13's Next steps).
  const keys = patterns.map(({ question }) => question.key);
  const latest = useRef({ keys, canEdit });
  latest.current = { keys, canEdit };
  useEffect(() => {
    const { keys: shown, canEdit: editable } = latest.current;
    if (focusKey === undefined || !shown.includes(focusKey)) return;
    setCurrent(focusKey);
    // After the card opened: the field is in it from the next frame. A Viewer's open
    // question is scrolled to instead.
    requestAnimationFrame(() => {
      const card = document.getElementById(patternId(focusKey));
      if (!editable) {
        card?.scrollIntoView({ block: "center" });
        return;
      }
      card?.querySelector<HTMLElement>("textarea:not([readonly])")?.focus();
    });
  }, [focusKey]);

  // Leaving the screen sends what waits (design-spec 6.0.2「画面を離れるとき」).
  const keysRef = useRef<string[]>([]);
  keysRef.current = keys.map((key) => answerKey(validationId, key));
  useEffect(
    () => () => {
      for (const key of keysRef.current) autosave.flush(key);
    },
    [autosave],
  );

  if (patterns.length === 0) return null;
  return (
    <Stack gap="space-100">
      <Heading level={2} variant="label">
        {t("validation:competitors.patterns")}
      </Heading>
      <QuestionList>
        {patterns.map(({ question, answer }) => {
          const view = answers.viewOf(question, answer);
          const mode = !canEdit
            ? "open"
            : current === question.key
              ? "focused"
              : "quiet";
          return (
            <QuestionListItem key={question.key}>
              <QuestionCard
                id={patternId(question.key)}
                title={question.title}
                question={question.prompt}
                headingLevel={3}
                mode={mode}
                status={
                  view.state === null
                    ? undefined
                    : {
                        state: moonOf[view.state],
                        label: fauLabel(view.state, {
                          confidence: view.confidence,
                          evidenceCount: view.counted,
                        }),
                        isWarning: view.state === "fact_no_evidence",
                      }
                }
                excerpt={hasText(view.text) ? view.text : null}
                commentCount={answer.commentCount}
                onFocusRequest={() => setCurrent(question.key)}
              >
                {mode === "quiet" ? undefined : (
                  <AnswerFields
                    view={view}
                    answers={answers}
                    validationId={validationId}
                    ideaId={idea.id}
                    canEdit={canEdit}
                  />
                )}
              </QuestionCard>
            </QuestionListItem>
          );
        })}
      </QuestionList>
    </Stack>
  );
}

/** The shape of 15 while its list loads (design-spec 6.0.6). */
function CardsSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <Stack gap="space-300">
      {[0, 1, 2].map((card) => (
        <Stack key={card} gap="space-100">
          <Text variant="label">{t("validation:competitors.title")}</Text>
          <Text>{t("validation:competitors.empty", { range: "" })}</Text>
        </Stack>
      ))}
    </Stack>
  );
}

function CompetitorsBody({
  home,
  search,
  modal,
  about,
  onSearch,
  onOpenRow,
  onCloseRow,
}: {
  home: ValidationHome;
  search: CompetitorsSearch;
  modal: string | undefined;
  about: string | undefined;
  /** Replaces the URL's search (the view). */
  onSearch: (next: CompetitorsSearch) => void;
  /** Opens a competitor's dialog: Back closes it. */
  onOpenRow: (competitorId: string) => void;
  /** Closes the competitor's dialog, going back if it was opened here. */
  onCloseRow: () => void;
}) {
  const { t } = useTranslation(["validation", "common", "app"]);
  const { me, workspace, role } = useWorkspace();
  const queryClient = useQueryClient();
  const modals = useModal();
  const sources = useSources();
  const forFact = useRouterState({
    select: (state) => state.location.state.evidenceForFact === true,
  });
  const { idea, validationId } = home;
  const canEdit = role !== "viewer" && !idea.archived;
  const list = competitorsQuery(idea.id, validationId);
  const query = useQuery(list);
  const isSlow = useIsSlow(query.isPending);
  const [isAdding, setAdding] = useState(false);
  const [isReordering, setReordering] = useState(false);
  const [deleting, setDeleting] = useState<Competitor | null>(null);
  const empty = useRange(query.data?.guidance ?? { min: 0, max: 0 });

  const cache: AnswersCache = {
    get: (questionKey) =>
      queryClient
        .getQueryData(list.queryKey)
        ?.patterns.find(({ question }) => question.key === questionKey)?.answer,
    update: (questionKey, change) =>
      putSaved<CompetitorList>(queryClient, list.queryKey, (data) =>
        data === undefined
          ? undefined
          : {
              ...data,
              patterns: data.patterns.map((pattern) =>
                pattern.question.key === questionKey
                  ? { ...pattern, answer: change(pattern.answer) }
                  : pattern,
              ),
            },
      ),
    reload: () =>
      void queryClient.invalidateQueries({ queryKey: list.queryKey }),
  };
  const answers = useAnswers(validationId, cache, (questionKey, isFact) =>
    modals.open("evidence", {
      about: `validation_answer:${validationId}:${questionKey}`,
      forFact: isFact,
    }),
  );

  // What the screen shows when a delete settles, which may be later: a user who left or
  // moved on meanwhile is not taken back.
  const latest = useRef({ row: search.row, onCloseRow, isOpen: true });
  latest.current = { row: search.row, onCloseRow, isOpen: true };
  useEffect(() => {
    latest.current.isOpen = true;
    return () => {
      latest.current.isOpen = false;
    };
  }, []);
  const remove = useMutation({
    mutationFn: (competitorId: string) =>
      unwrap(
        api()
          .api.v1.competitors({ competitorId: inPath(competitorId) })
          .delete({}),
      ),
    onSettled: (_data, error, competitorId) => {
      // Deleted, here or already elsewhere (V9 answers 404 for a deleted row).
      if (
        error !== null &&
        !(error instanceof ApiError && error.code === "NOT_FOUND")
      ) {
        toastFailure(error, () => remove.mutate(competitorId));
        return;
      }
      putSaved<CompetitorList>(queryClient, list.queryKey, (data) =>
        data === undefined
          ? undefined
          : {
              ...data,
              items: data.items.filter(({ id }) => id !== competitorId),
            },
      );
      void queryClient.invalidateQueries({ queryKey: ideaKey(idea.id) });
      // The card's dialog closes only while 15 is open and the dialog is that card's.
      const { row, onCloseRow: close, isOpen } = latest.current;
      if (isOpen && row === competitorId) close();
    },
  });

  if (query.isError) {
    return (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  if (query.data === undefined) {
    return isSlow ? (
      <SlowLoadingState onRetry={() => void query.refetch()} />
    ) : (
      <Skeleton isLoading>
        <CompetitorsSkeleton />
      </Skeleton>
    );
  }

  const { items, patterns, guidance } = query.data;
  const title =
    home.sections.find(({ key }) => key === "04")?.title ??
    t("validation:competitors.title");
  const view = search.view ?? "cards";
  const openNew = () => setAdding(true);
  const emptyState = (
    <IllustratedMessage
      headingLevel={2}
      size="S"
      icon={<Swords />}
      heading={t("validation:competitors.empty", { range: empty })}
      actions={
        canEdit ? (
          <Button variant="primary" onPress={openNew}>
            {t("validation:competitors.add")}
          </Button>
        ) : undefined
      }
    />
  );
  const moreOf = (competitor: Competitor) =>
    canEdit ? (
      <ActionMenu
        aria-label={t("validation:competitors.more", {
          name: competitor.name,
        })}
        onAction={(key) => {
          if (key === "edit") onOpenRow(competitor.id);
          if (key === "reorder") setReordering(true);
          if (key === "delete") setDeleting(competitor);
        }}
      >
        <MenuItem id="edit">{t("validation:competitors.edit")}</MenuItem>
        <MenuItem id="reorder">{t("validation:competitors.reorder")}</MenuItem>
        <MenuItem id="delete">{t("validation:competitors.delete")}</MenuItem>
      </ActionMenu>
    ) : undefined;

  const cards = (
    <CardView
      aria-label={t("validation:competitors.list")}
      items={items}
      dependencies={[canEdit, workspace.currency]}
      onAction={(key) => onOpenRow(String(key))}
      addItem={
        canEdit
          ? { label: t("validation:competitors.add"), onAction: openNew }
          : undefined
      }
      renderEmptyState={() => emptyState}
    >
      {(competitor) => (
        <Card
          id={competitor.id}
          textValue={competitor.name}
          eyebrow={
            competitor.type === null
              ? undefined
              : t(`common:competitorType.${competitor.type}`)
          }
          title={competitor.name}
          figure={
            competitor.typicalPrice === null
              ? t("validation:competitors.noPrice")
              : priceText(competitor.typicalPrice, workspace.currency)
          }
          figureDescription={
            competitor.typicalPrice === null || !hasText(competitor.priceNote)
              ? undefined
              : competitor.priceNote
          }
          isFigurePlaceholder={competitor.typicalPrice === null}
          details={COMPETITOR_TEXTS.map((field) => ({
            id: field,
            label: t(`validation:competitors.card.${field}`),
            value: hasText(competitor[field]) ? (
              competitor[field]
            ) : (
              <Text variant="body-sm" tone="tertiary">
                {t("validation:rows.empty")}
              </Text>
            ),
          }))}
          footer={sources(competitor)}
          openThreadCount={competitor.unresolvedThreadCount}
          actions={moreOf(competitor)}
        />
      )}
    </CardView>
  );

  const opened =
    search.row === undefined
      ? undefined
      : items.find(({ id }) => id === search.row);
  const evidenceCompetitor =
    modal === "evidence" && canEdit
      ? items.find(({ id }) => aboutOf(id) === about)
      : undefined;
  const evidencePattern = (() => {
    if (modal !== "evidence" || !canEdit || about === undefined) return null;
    const prefix = `validation_answer:${validationId}:`;
    if (!about.startsWith(prefix)) return null;
    const pattern = patterns.find(
      ({ question }) => question.key === about.slice(prefix.length),
    );
    if (pattern === undefined) return null;
    const view = answers.viewOf(pattern.question, pattern.answer);
    return view.state === null ? null : { ...view, state: view.state };
  })();

  return (
    <>
      <CardComparePattern
        notice={
          idea.archived ? <ArchivedIdeaAlert ideaId={idea.id} /> : undefined
        }
        header={<Heading level={1}>{title}</Heading>}
        count={
          <>
            <MoonGlyph
              state={dotState[checkStateOf(items.length, guidance.min)]}
            />
            {t("validation:competitors.count", {
              count: items.length,
              range: empty,
            })}
          </>
        }
        primaryAction={
          canEdit ? (
            <Button variant="secondary" onPress={openNew}>
              <Plus />
              {t("validation:competitors.add")}
            </Button>
          ) : undefined
        }
        view={view}
        onViewChange={(next) => onSearch({ ...search, view: next })}
        cards={cards}
        table={items.length === 0 ? emptyState : <CompareTable items={items} />}
      >
        <PatternQuestions
          home={home}
          patterns={patterns}
          answers={answers}
          focusKey={search.q}
          canEdit={canEdit}
        />
      </CardComparePattern>
      {/* A row not on the list is Not found once the list is read again, not while. */}
      {search.row !== undefined &&
        (opened !== undefined || !query.isFetching) &&
        (opened === undefined ? (
          <Dialog
            isOpen
            onOpenChange={(isOpen) => {
              if (!isOpen) onCloseRow();
            }}
            isDismissable
            size="S"
            title={title}
          >
            <NotFoundState
              dashboardHref={dashboardHref(me)}
              headingLevel={3}
              size="S"
            />
          </Dialog>
        ) : (
          <Dialog
            isOpen
            onOpenChange={(isOpen) => {
              if (!isOpen) onCloseRow();
            }}
            isDismissable
            size="L"
            title={
              canEdit ? t("validation:competitors.editTitle") : opened.name
            }
          >
            {canEdit ? (
              <CompetitorEditor
                ideaId={idea.id}
                listKey={list.queryKey}
                competitor={opened}
                onOpenEvidence={() =>
                  modals.open("evidence", { about: aboutOf(opened.id) })
                }
              />
            ) : (
              <CompetitorFacts competitor={opened} />
            )}
          </Dialog>
        ))}
      {isAdding && canEdit && (
        <NewCompetitorDialog
          ideaId={idea.id}
          validationId={validationId}
          onCreated={(created) => {
            // In the list before its dialog opens: no "Not found" while it is read again.
            putCompetitor(queryClient, list.queryKey, created);
            setAdding(false);
            onOpenRow(created.id);
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {isReordering && canEdit && (
        <ReorderDialog
          title={t("validation:competitors.reorderTitle")}
          items={items.map(({ id, name }) => ({ id, label: name }))}
          send={async (ids) => {
            await unwrap(
              api()
                .api.v1.validations({ validationId: inPath(validationId) })
                .competitors.order.put({ ids }),
            );
            putSaved<CompetitorList>(queryClient, list.queryKey, (data) =>
              data === undefined
                ? undefined
                : {
                    ...data,
                    items: ids.flatMap((id, index) => {
                      const competitor = data.items.find(
                        (item) => item.id === id,
                      );
                      return competitor === undefined
                        ? []
                        : [{ ...competitor, sortOrder: index }];
                    }),
                  },
            );
          }}
          reload={async () =>
            (await queryClient.fetchQuery({ ...list, staleTime: 0 })).items.map(
              ({ id, name }) => ({ id, label: name }),
            )
          }
          onClose={() => setReordering(false)}
        />
      )}
      {deleting !== null && (
        <DeleteCompetitorQuestion
          onDelete={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
      {evidenceCompetitor !== undefined && (
        <ModalBoundary key="evidence" onClose={modals.close}>
          <RowEvidenceSheet
            ideaId={idea.id}
            validationId={validationId}
            type="competitor"
            rowId={evidenceCompetitor.id}
            label={t("common:itemLabel.row", {
              list: t("common:itemLabel.list.competitor"),
              text: evidenceCompetitor.name,
            })}
            noun={t("validation:competitors.noun")}
            evidence={evidenceCompetitor.evidence}
            lockVersionNow={() =>
              queryClient
                .getQueryData(list.queryKey)
                ?.items.find(({ id }) => id === evidenceCompetitor.id)
                ?.lockVersion ?? evidenceCompetitor.lockVersion
            }
            saveKey={competitorKey(evidenceCompetitor.id)}
            onChanged={(change) =>
              putCompetitor(queryClient, list.queryKey, {
                id: evidenceCompetitor.id,
                ...change,
              })
            }
            onReload={() =>
              void queryClient.invalidateQueries({ queryKey: list.queryKey })
            }
            onClose={modals.close}
          />
        </ModalBoundary>
      )}
      {evidencePattern !== null && (
        <ModalBoundary key="evidence" onClose={modals.close}>
          <AnswerEvidenceSheet
            ideaId={idea.id}
            validationId={validationId}
            view={evidencePattern}
            label={[
              t("common:itemLabel.question", {
                section: "04",
                title: evidencePattern.question.title,
              }),
              evidencePattern.question.prompt,
            ].join(t("app:separator"))}
            cache={cache}
            answers={answers}
            forFact={forFact}
            onClose={modals.close}
          />
        </ModalBoundary>
      )}
    </>
  );
}

/**
 * 15's shape while it loads (design-spec 6.0.6). Drawn inside a `Skeleton`, its words are
 * bars and its Cards / Table switch is inert.
 */
export function CompetitorsSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <CardComparePattern
      header={<Heading level={1}>{t("validation:competitors.title")}</Heading>}
      view="cards"
      onViewChange={() => {}}
      cards={<CardsSkeleton />}
      table={null}
    />
  );
}

/**
 * 15 Competitors (design-spec 6.10, s15-competitors.html): pattern E. The idea's
 * competitors and substitutes as cards in their order (Cards / Table on a desktop and a
 * tablet), each opening its dialog to edit (to read, for a Viewer and an archived idea);
 * + Add competitor; Reorder and Delete in a card's ⋯; and Survivor and Failure Patterns
 * under them.
 */
export function CompetitorsScreen({
  ideaId,
  search,
  modal,
  about,
}: {
  ideaId: string;
  search: CompetitorsSearch;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["ideas", "validation"]);
  const { me, workspace } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const home = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(home.isPending);
  const data =
    home.data?.idea.workspaceId === workspace.id ? home.data : undefined;
  const title = data?.sections.find(({ key }) => key === "04")?.title;
  useDocumentTitle(
    ...(data === undefined || title === undefined
      ? []
      : [title, workspace.name]),
  );
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedDetail === true,
  });
  const to = (next: CompetitorsSearch, replace: boolean) =>
    void navigate({
      href: competitorsHref(workspace.id, ideaId, next),
      replace,
      state: (previous) =>
        replace ? previous : { ...previous, openedDetail: true },
    });

  let body: ReactNode;
  if (home.data !== undefined && data === undefined) {
    // Another workspace's idea under this one's URL (SDD 4章).
    body = <NoAccessState dashboardHref={dashboardHref(me)} />;
  } else if (data !== undefined) {
    body = (
      <CompetitorsBody
        home={data}
        search={search}
        modal={modal}
        about={about}
        onSearch={(next) => to(next, true)}
        onOpenRow={(row) => to({ ...search, row }, false)}
        onCloseRow={() => {
          if (openedHere) router.history.back();
          else to({ ...search, row: undefined }, true);
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
    body = <SlowLoadingState onRetry={() => void home.refetch()} />;
  } else {
    body = (
      <Skeleton isLoading>
        <CompetitorsSkeleton />
      </Skeleton>
    );
  }
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope={
        data === undefined
          ? "competitor:"
          : ["competitor:", answerKey(data.validationId, "V.04.")]
      }
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
