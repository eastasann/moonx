import {
  formatMetric,
  hasText,
  isQuestionShown,
  keyMetricOf,
  PITCH_SPEAKER_NOTE_KEYS,
  planItemProgress,
} from "@moonx/domain";
import { formatCount } from "@moonx/i18n";
import {
  type ExecutionItem,
  type ExecutionType,
  executionSectionKey,
  type PlanAnswer,
  type PlanHome,
  type PlanItem,
  type ScenarioColumn,
  type TemplateQuestion,
} from "@moonx/schemas";
import {
  ActionButton,
  Breadcrumb,
  Breadcrumbs,
  Button,
  DescriptionList,
  DescriptionListItem,
  Flex,
  Heading,
  InlineAlert,
  Link,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  MoonGlyph,
  QuestionCard,
  QuestionFormPattern,
  Skeleton,
  Stack,
  Text,
  Well,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AiMenu } from "../components/AiMenu";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import {
  type ExecutionCache,
  ExecutionList,
  executionKey,
  inListOrder,
} from "../components/ExecutionItems";
import { ItemHistoryButton } from "../components/HistoryPanel";
import {
  ExampleAndHint,
  type PlanAnswersCache,
  type PlanAnswerView,
  PlanTableField,
  PlanTextFields,
  planAnswerKey,
  tableExcerpt,
  usePlanAnswers,
} from "../components/PlanAnswers";
import { PlanReferences } from "../components/PlanReferences";
import { ArchivedPlanAlert } from "../components/planParts";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, usePanel, useWorkspace } from "../components/workspace";
import { useAutosave } from "../lib/autosave-react";
import { questionLabel, rowLabel } from "../lib/item-labels";
import {
  costsHref,
  economicsHref,
  executionHref,
  executionTabOf,
  ideaHref,
  ideasHref,
  type PlanItemSearch,
  planHref,
  planItemHref,
} from "../lib/links";
import {
  metricText,
  SCENARIO_KEY_FIGURES,
  scenarioFigureFormat,
} from "../lib/metrics";
import {
  costsQuery,
  ideaKey,
  planHomeQuery,
  planItemQuery,
  planKey,
  putSaved,
  validationHomeQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

export type { PlanItemSearch };

/** The number of items a plan has (design-spec 6.12: §1–30). */
const ITEM_COUNT = 30;

/** An item's number as the URL gives it, or null when it is no item (SDD 4章: 1–30). */
function itemNoOf(param: string): number | null {
  if (!/^[1-9][0-9]?$/.test(param)) return null;
  const itemNo = Number(param);
  return itemNo <= ITEM_COUNT ? itemNo : null;
}

/** The item's key in its sub-items' IDs and the sections of the panels: "01"–"30". */
const itemKeyOf = (itemNo: number) => String(itemNo).padStart(2, "0");

/** The execution types the item's execution sub-items show. */
const executionTypesOf = (prompts: readonly TemplateQuestion[]) =>
  prompts.flatMap((prompt) =>
    prompt.options?.kind === "execution_view"
      ? [prompt.options.executionType]
      : [],
  );

/** The prefix of the key metrics that are scenario columns (design-spec 6.4). */
const SCENARIO_PREFIX = "scenario:";
const COST_ROW_PREFIX = "cost_row:";

/** The single-value keys whose numbers 17 holds; the others are 18's (design-spec 6.4). */
const COSTS_KEYS = new Set([
  "initial_cost_total",
  "monthly_fixed_total",
  "variable_cost_per_unit",
]);

/**
 * Where the numbers of a sub-item are fixed (design-spec 6.4「直す画面」): 17 for the
 * costs (on the cost row for one), 18 for the rest and for several numbers.
 */
function editHrefOf(
  workspaceId: string,
  ideaId: string,
  keys: readonly string[],
): string {
  const [only] = keys;
  if (keys.length === 1 && only !== undefined) {
    if (only.startsWith(COST_ROW_PREFIX)) {
      return costsHref(workspaceId, ideaId, {
        row: only.slice(COST_ROW_PREFIX.length),
      });
    }
    if (COSTS_KEYS.has(only)) return costsHref(workspaceId, ideaId);
    if (only === "selling_price" || only === "operating_days") {
      return economicsHref(workspaceId, ideaId, { field: only });
    }
    if (only === "capacity_units_day") {
      return economicsHref(workspaceId, ideaId, { field: "units_capacity" });
    }
  }
  return economicsHref(workspaceId, ideaId);
}

/** A number sub-item's numbers: its scenario columns, and its single-value metrics. */
function metricsOf(question: TemplateQuestion, item: PlanItem) {
  const keys =
    question.options?.kind === "linked_metric"
      ? question.options.metricKeys
      : [];
  const scenarios = keys.flatMap((key) => {
    if (!key.startsWith(SCENARIO_PREFIX)) return [];
    const column = item.scenarios.find(
      (scenario) => scenario.key === key.slice(SCENARIO_PREFIX.length),
    );
    return column === undefined ? [] : [column];
  });
  const single = keys.filter((key) => !key.startsWith(SCENARIO_PREFIX));
  return { keys, scenarios, single };
}

/**
 * A key metric's name (design-spec 6.4): a cost row's is the row's name in the validation,
 * read only when a sub-item names numbers beside one (alone, its sub-item names it), and
 * its template key while it loads or for a row the validation no longer has.
 */
function useMetricName(ideaId: string, item: PlanItem) {
  const { t } = useTranslation(["common"]);
  const namesCostRow = item.prompts.some(
    (prompt) =>
      prompt.options?.kind === "linked_metric" &&
      prompt.options.metricKeys.length > 1 &&
      prompt.options.metricKeys.some((key) => key.startsWith(COST_ROW_PREFIX)),
  );
  const validationId = useQuery({
    ...validationHomeQuery(ideaId),
    enabled: namesCostRow,
  }).data?.validationId;
  const costs = useQuery({
    ...costsQuery(ideaId, validationId ?? ""),
    enabled: namesCostRow && validationId !== undefined,
  });
  return (key: string) => {
    if (!key.startsWith(COST_ROW_PREFIX)) {
      return t(`common:metric.${key}` as never);
    }
    const templateKey = key.slice(COST_ROW_PREFIX.length);
    return (
      costs.data?.items.find((row) => row.templateKey === templateKey)?.name ??
      templateKey
    );
  };
}

/** A scenario's figures, as 6.4 gives `scenario:*` (units, revenue, profit, margin). */
function ScenarioFigures({
  column,
  currency,
}: {
  column: ScenarioColumn;
  currency: string;
}) {
  const { t } = useTranslation(["validation"]);
  return (
    <DescriptionList>
      {SCENARIO_KEY_FIGURES.map((figure) => (
        <DescriptionListItem
          key={figure}
          label={t(`validation:economics.metric.${figure}`)}
        >
          <Text variant="number">
            {metricText(
              column[figure],
              scenarioFigureFormat(figure, column),
              currency,
            )}
          </Text>
        </DescriptionListItem>
      ))}
    </DescriptionList>
  );
}

/**
 * A number sub-item (design-spec 6.12「検証の数字」): the validation's numbers, read only,
 * and beside them the way to where they are fixed (6.4「直す画面」): "Edit in validation"
 * for the Owners and Members, "Open in validation" for the others, as on 20. A version
 * open shows the numbers it saved.
 */
function MetricsContent({
  question,
  item,
  ideaId,
  canEditValidation,
  isVersion,
}: {
  question: TemplateQuestion;
  item: PlanItem;
  ideaId: string;
  canEditValidation: boolean;
  isVersion: boolean;
}) {
  const { t } = useTranslation(["plans", "common"]);
  const { workspace } = useWorkspace();
  const nameOf = useMetricName(ideaId, item);
  const { keys, scenarios, single } = metricsOf(question, item);
  const value = (key: string) =>
    formatMetric(key, keyMetricOf(item.metrics, key), workspace.currency);
  return (
    <Stack gap="space-200">
      {single.length === 1 &&
      scenarios.length === 0 &&
      single[0] !== undefined ? (
        <Text variant="number">{value(single[0])}</Text>
      ) : (
        single.length > 0 && (
          <DescriptionList>
            {single.map((key) => (
              <DescriptionListItem key={key} label={nameOf(key)}>
                <Text variant="number">{value(key)}</Text>
              </DescriptionListItem>
            ))}
          </DescriptionList>
        )
      )}
      {scenarios.map((column) => (
        <Stack key={column.key} gap="space-75">
          {scenarios.length > 1 && (
            <Text variant="label">{t(`common:scenario.${column.key}`)}</Text>
          )}
          <ScenarioFigures column={column} currency={workspace.currency} />
        </Stack>
      ))}
      <Flex columnGap="space-200" alignItems="baseline" wrap>
        <Link href={editHrefOf(workspace.id, ideaId, keys)}>
          {canEditValidation
            ? t("plans:home.keyNumbers.edit")
            : t("plans:home.keyNumbers.open")}
        </Link>
        {isVersion && (
          <Text variant="caption" tone="secondary">
            {t("plans:home.keyNumbers.fromVersion")}
          </Text>
        )}
      </Flex>
    </Stack>
  );
}

/** A number sub-item's quiet line: its numbers, named when there are several. */
function useMetricsExcerpt(ideaId: string, item: PlanItem) {
  const { t } = useTranslation(["validation", "app"]);
  const { workspace } = useWorkspace();
  const nameOf = useMetricName(ideaId, item);
  return (question: TemplateQuestion): string => {
    const { scenarios, single } = metricsOf(question, item);
    const named = single.length + scenarios.length > 1;
    const parts = [
      ...single.map((key) => {
        const text = formatMetric(
          key,
          keyMetricOf(item.metrics, key),
          workspace.currency,
        );
        return named ? `${nameOf(key)} ${text}` : text;
      }),
      ...scenarios.flatMap((column) =>
        (["revenue", "operatingProfit"] as const).map(
          (figure) =>
            `${t(`validation:economics.metric.${figure}`)} ${metricText(
              column[figure],
              scenarioFigureFormat(figure, column),
              workspace.currency,
            )}`,
        ),
      ),
    ];
    return parts.join(t("app:separator"));
  };
}

/**
 * The item's title with ▼, the switch to the plan's other items (design-spec 6.2「本文
 * の見出し」, 21 uses 11's parts): Part A and Part B, each item opening on the version
 * open here if one is.
 */
function ItemSwitchTitle({
  home,
  item,
  versionId,
}: {
  home: PlanHome;
  item: PlanItem;
  versionId: string | undefined;
}) {
  const { t } = useTranslation(["plans"]);
  const { workspace } = useWorkspace();
  return (
    <Flex gap="space-50" alignItems="center">
      <Heading level={1}>
        {t("plans:home.item", { no: item.itemNo, title: item.title })}
      </Heading>
      <MenuTrigger>
        <ActionButton isQuiet aria-label={t("plans:item.switchItem")}>
          <ChevronDown />
        </ActionButton>
        <Menu aria-label={t("plans:item.items", { plan: home.name })}>
          {home.parts.map((part) => (
            <MenuSection
              key={part.part}
              title={t(`plans:home.part.${part.part}`)}
            >
              {part.items.map((entry) => (
                <MenuItem
                  key={entry.itemNo}
                  id={String(entry.itemNo)}
                  href={planItemHref(
                    workspace.id,
                    home.ideaId,
                    home.id,
                    entry.itemNo,
                    { version: versionId },
                  )}
                >
                  {t("plans:home.item", {
                    no: entry.itemNo,
                    title: entry.title,
                  })}
                </MenuItem>
              ))}
            </MenuSection>
          ))}
        </Menu>
      </MenuTrigger>
    </Flex>
  );
}

/** A note of the item under a sub-item's field: §30's are the decks' speaker notes. */
function useSubItemNote() {
  const { t } = useTranslation(["plans"]);
  return (questionKey: string): ReactNode => {
    const variant =
      questionKey === PITCH_SPEAKER_NOTE_KEYS.one
        ? "one"
        : questionKey === PITCH_SPEAKER_NOTE_KEYS.five
          ? "five"
          : null;
    return variant === null ? null : (
      <Text variant="body-sm" tone="secondary" elementType="p">
        {t(`plans:item.pitchNotes.${variant}`)}
      </Text>
    );
  };
}

/** An answer read (a Viewer, an archived plan, a version): its text, or "Empty". */
function AnswerText({ value }: { value: string | null }) {
  const { t } = useTranslation(["plans"]);
  return hasText(value) ? (
    <Text variant="body-long" elementType="p">
      {value}
    </Text>
  ) : (
    <Text tone="tertiary" elementType="p">
      {t("plans:home.empty")}
    </Text>
  );
}

/**
 * One item and its sub-items, ready (design-spec 6.12「21」): pattern C with 11's parts;
 * each sub-item by its type, a text or choice saved as typed, a table's rows, the
 * validation's numbers, the execution items of a type; the item's references under its
 * title.
 */
function ItemForm({
  home,
  item,
  focusKey,
  versionId,
}: {
  home: PlanHome;
  item: PlanItem;
  focusKey: string | undefined;
  versionId: string | undefined;
}) {
  const { t } = useTranslation(["plans", "validation", "app"]);
  const { workspace, role } = useWorkspace();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const panel = usePanel();
  const navigate = useNavigate();
  const metricsExcerpt = useMetricsExcerpt(home.ideaId, item);
  const noteOf = useSubItemNote();
  const canEdit = !item.readOnly;
  const itemKey = itemKeyOf(item.itemNo);
  const queryKey = planItemQuery(
    home.ideaId,
    home.id,
    item.itemNo,
    versionId,
  ).queryKey;
  const onSaved = () => {
    // 20 counts what the item changes (its fill, the items due, "+ changes"): read again
    // when it shows.
    void queryClient.invalidateQueries({
      queryKey: planKey(home.ideaId, home.id),
      refetchType: "none",
    });
  };
  const answersCache: PlanAnswersCache = {
    put: (answer) =>
      putSaved<PlanItem>(queryClient, queryKey, (data) =>
        data === undefined
          ? undefined
          : {
              ...data,
              answers: data.answers.map((current) =>
                current.questionKey === answer.questionKey ? answer : current,
              ),
            },
      ),
    reload: () => void queryClient.invalidateQueries({ queryKey }),
  };
  const executionCache: ExecutionCache = {
    put: (saved) =>
      putSaved<PlanItem>(queryClient, queryKey, (data) => {
        if (data === undefined) return undefined;
        const isListed = data.execution.some(({ id }) => id === saved.id);
        return {
          ...data,
          execution: inListOrder(
            isListed
              ? data.execution.map((current) =>
                  current.id === saved.id ? saved : current,
                )
              : [...data.execution, saved],
          ),
        };
      }),
    remove: (itemId) =>
      putSaved<PlanItem>(queryClient, queryKey, (data) =>
        data === undefined
          ? undefined
          : {
              ...data,
              execution: data.execution.filter(({ id }) => id !== itemId),
            },
      ),
    reload: () => void queryClient.invalidateQueries({ queryKey }),
  };
  const answers = usePlanAnswers(home.id, answersCache, onSaved);

  const byKey = new Map<string, PlanAnswer>(
    item.answers.map((answer) => [answer.questionKey, answer]),
  );
  const views = new Map<string, PlanAnswerView>();
  for (const question of item.prompts) {
    const answer = byKey.get(question.key);
    if (answer !== undefined)
      views.set(question.key, answers.viewOf(question, answer));
  }
  const values = new Map(
    [...views].map(([key, view]) => [key, { text: view.value }]),
  );
  // A display condition hides a sub-item as 11 hides a question (6.2).
  const shown = item.prompts.filter((question) =>
    isQuestionShown(question, values),
  );
  const executionOf = (type: ExecutionType): ExecutionItem[] =>
    item.execution.filter((entry) => entry.type === type);
  const progress = planItemProgress(shown, {
    answers: new Map(
      [...views].map(([key, view]) => [
        key,
        { text: view.value, rows: view.rows },
      ]),
    ),
    executionCounts: new Map(
      executionTypesOf(shown).map((type) => [type, executionOf(type).length]),
    ),
  });
  /** Whether a sub-item counts as filled (6.12「項目の状態」); numbers count as done. */
  const isFilled = (question: TemplateQuestion) => {
    if (question.answerType === "linked_metric") return true;
    if (question.options?.kind === "execution_view") {
      return executionOf(question.options.executionType).length > 0;
    }
    return views.get(question.key)?.isAnswered === true;
  };
  const shownIds = shown.map((question) => question.key);
  const firstOpen =
    shown.find(
      (question) =>
        question.answerType !== "linked_metric" && !isFilled(question),
    )?.key ??
    shownIds[0] ??
    null;
  const [chosen, setChosen] = useState<string | null>(() =>
    focusKey !== undefined && shownIds.includes(focusKey)
      ? focusKey
      : firstOpen,
  );
  const currentId =
    chosen !== null && shownIds.includes(chosen) ? chosen : firstOpen;
  const [isAtEnd, setAtEnd] = useState(false);

  // Opening, and a `?q=` given later, focus the sub-item (6.2「開いたとき」): its field,
  // which moves it to the middle (4.1 C). A read-only item has no focus to move.
  const latest = useRef({ shownIds, currentId, canEdit });
  latest.current = { shownIds, currentId, canEdit };
  const hasOpened = useRef(false);
  // Runs on opening and when `?q=` changes; the rest is read from `latest`.
  useEffect(() => {
    const {
      shownIds: ids,
      currentId: current,
      canEdit: editable,
    } = latest.current;
    const target =
      focusKey !== undefined && ids.includes(focusKey)
        ? focusKey
        : hasOpened.current
          ? null
          : current;
    hasOpened.current = true;
    if (target === null) return;
    setChosen(target);
    setAtEnd(false);
    if (!editable) return;
    requestAnimationFrame(() => {
      // Sub-item IDs are the template's ([A-Z0-9._]): safe inside the selector.
      const field = document.querySelector<HTMLElement>(
        `[data-question="${target}"] textarea:not([readonly]), [data-question="${target}"] input:not([type="hidden"]):not([readonly])`,
      );
      if (field !== null) {
        field.focus();
        return;
      }
      // Numbers, a table's rows and execution items have no field to enter: the card
      // itself comes to the middle (4.1 C).
      document
        .querySelector(`[data-question="${target}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  }, [focusKey]);

  // Leaving the screen sends what waits (design-spec 6.0.2「画面を離れるとき」).
  const keysRef = useRef<string[]>([]);
  keysRef.current = [
    ...item.answers.map((answer) => planAnswerKey(home.id, answer.questionKey)),
    ...item.execution.map((entry) => executionKey(entry.id)),
  ];
  useEffect(
    () => () => {
      for (const key of keysRef.current) autosave.flush(key);
    },
    [autosave],
  );

  const titleOf = (itemNo: number) =>
    home.parts
      .flatMap((part) => part.items)
      .find((entry) => entry.itemNo === itemNo)?.title;
  const neighbour = (step: -1 | 1) => {
    const itemNo = item.itemNo + step;
    const title = titleOf(itemNo);
    return title === undefined
      ? undefined
      : {
          href: planItemHref(workspace.id, home.ideaId, home.id, itemNo, {
            version: versionId,
          }),
          name: t("plans:home.item", { no: itemNo, title }),
        };
  };
  const previous = neighbour(-1);
  const next = neighbour(1);
  const go = (href: string) => void navigate({ href });
  const here = planItemHref(workspace.id, home.ideaId, home.id, item.itemNo);
  const answerItem = (questionKey: string) =>
    ({
      kind: "item",
      item: { type: "plan_answer", id: home.id, key: questionKey },
    }) as const;
  const tools = (question: TemplateQuestion, answer: PlanAnswer) => {
    const label = questionLabel(question.key, question.title);
    return (
      <>
        <ItemCommentsButton
          label={label}
          count={answer.commentCount}
          onPress={() => panel.show("comments", answerItem(question.key))}
        />
        <ItemHistoryButton
          label={label}
          onPress={() => panel.show("history", answerItem(question.key))}
        />
      </>
    );
  };
  const hasTotals = item.references.some(
    (reference) => reference.kind === "totals",
  );
  const firstTable = shown.find((question) => question.answerType === "table");
  const hasGoNoGo = item.references.some(
    (reference) => reference.kind === "go_no_go_history",
  );

  const header = (
    <Stack gap="space-100">
      {home.ideaArchived ? (
        <ArchivedIdeaAlert ideaId={home.ideaId} />
      ) : (
        home.archived && <ArchivedPlanAlert home={home} />
      )}
      {home.viewingVersion !== null && (
        <InlineAlert
          variant="informative"
          title={t("plans:home.viewing", { name: home.viewingVersion.name })}
        >
          <Link href={here}>{t("plans:home.showLatest")}</Link>
        </InlineAlert>
      )}
      <Flex
        alignItems="end"
        justifyContent="space-between"
        gap="space-300"
        wrap
      >
        <ItemSwitchTitle home={home} item={item} versionId={versionId} />
        <Flex gap="space-100" alignItems="center">
          <MoonGlyph
            value={progress.total === 0 ? 1 : progress.filled / progress.total}
          />
          <Text tone="secondary">
            <Text variant="number" tone="secondary">
              {t("validation:questions.progress", {
                answered: formatCount(progress.filled),
                total: formatCount(progress.total),
              })}
            </Text>
            {t("validation:questions.progressSuffix")}
          </Text>
        </Flex>
      </Flex>
      {item.guidance !== null && (
        <Text tone="secondary" elementType="p">
          {item.guidance}
        </Text>
      )}
      <PlanReferences
        references={item.references}
        note={
          hasGoNoGo && canEdit ? (
            <Text variant="body-sm" tone="secondary" elementType="p">
              {t("plans:item.goNoGoNote")}
            </Text>
          ) : undefined
        }
      />
    </Stack>
  );

  // Every sub-item shows its Example and Hint, read only too (6.12, as 11's 6.2).
  const renderContent = (question: TemplateQuestion): ReactNode => (
    <>
      {renderField(question)}
      {noteOf(question.key)}
      <ExampleAndHint question={question} />
    </>
  );
  const renderField = (question: TemplateQuestion): ReactNode => {
    if (question.answerType === "linked_metric") {
      return (
        <MetricsContent
          question={question}
          item={item}
          ideaId={home.ideaId}
          canEditValidation={role !== "viewer" && !home.ideaArchived}
          isVersion={home.viewingVersion !== null}
        />
      );
    }
    if (question.options?.kind === "execution_view") {
      return (
        <ExecutionList
          planId={home.id}
          type={question.options.executionType}
          items={executionOf(question.options.executionType)}
          cache={executionCache}
          canEdit={canEdit}
          onSaved={onSaved}
          executionHref={executionHref(workspace.id, home.ideaId, home.id, {
            tab: executionTabOf(question.options.executionType),
          })}
        />
      );
    }
    const view = views.get(question.key);
    if (view === undefined) return null;
    if (question.answerType === "table") {
      return (
        <PlanTableField
          view={view}
          answers={answers}
          canEdit={canEdit}
          hasTotals={hasTotals && question.key === firstTable?.key}
        />
      );
    }
    return canEdit ? (
      <PlanTextFields view={view} answers={answers} />
    ) : (
      <AnswerText value={view.value} />
    );
  };

  return (
    <QuestionFormPattern
      header={header}
      questionIds={shownIds}
      currentId={currentId}
      onCurrentChange={(id) => {
        setAtEnd(false);
        setChosen(id);
      }}
      isReadOnly={!canEdit}
      isAnswered={(id) => {
        const question = shown.find(({ key }) => key === id);
        return question !== undefined && isFilled(question);
      }}
      onEnd={() => setAtEnd(true)}
      end={
        isAtEnd ? (
          <Well>
            <Stack gap="space-300">
              <Heading level={2}>
                {t("plans:item.complete", {
                  item: itemKey,
                  answered: formatCount(progress.filled),
                  total: formatCount(progress.total),
                })}
              </Heading>
              <Flex gap="space-200" wrap>
                {next !== undefined && (
                  <Button variant="primary" onPress={() => go(next.href)}>
                    {t("plans:item.next", { item: next.name })}
                    <ArrowRight />
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onPress={() =>
                    go(
                      planHref(workspace.id, home.ideaId, home.id, {
                        version: versionId,
                      }),
                    )
                  }
                >
                  {t("plans:item.toHome")}
                </Button>
              </Flex>
            </Stack>
          </Well>
        ) : null
      }
      footer={
        canEdit ? (
          <AiMenu
            kind="business_plan"
            id={home.id}
            scope={itemKey}
            returnTo={here}
          />
        ) : undefined
      }
      previousSection={
        previous === undefined ? undefined : (
          <Button variant="secondary" isQuiet onPress={() => go(previous.href)}>
            <ArrowLeft />
            {t("plans:item.previousItem")}
          </Button>
        )
      }
      nextSection={
        next === undefined ? undefined : (
          <Button variant="secondary" onPress={() => go(next.href)}>
            {t("plans:item.next", { item: next.name })}
            <ArrowRight />
          </Button>
        )
      }
      renderQuestion={(id, mode) => {
        const question = shown.find(({ key }) => key === id);
        if (question === undefined) return null;
        const view = views.get(question.key);
        const excerpt =
          question.answerType === "linked_metric"
            ? metricsExcerpt(question)
            : question.options?.kind === "execution_view"
              ? (() => {
                  const titles = executionOf(question.options.executionType)
                    .map((entry) => entry.title)
                    .filter(hasText);
                  return titles.length === 0
                    ? null
                    : titles.join(t("app:separator"));
                })()
              : view === undefined
                ? null
                : question.answerType === "table"
                  ? tableExcerpt(view, workspace.currency, {
                      rows: (count) => t("plans:item.rows", { count }),
                      separator: t("app:separator"),
                    })
                  : hasText(view.value)
                    ? view.value
                    : null;
        return (
          <QuestionCard
            title={question.title}
            question={question.prompt}
            mode={mode}
            excerpt={excerpt}
            commentCount={view?.answer.commentCount}
            actions={
              view === undefined ? undefined : tools(question, view.answer)
            }
            onFocusRequest={() => {
              setAtEnd(false);
              setChosen(id);
            }}
          >
            {mode === "quiet" ? undefined : renderContent(question)}
          </QuestionCard>
        );
      }}
    />
  );
}

/**
 * 21's shape while it loads (design-spec 6.0.6): the title and the sub-items' rows.
 * Drawn inside a `Skeleton`, its words are bars.
 */
export function PlanItemSkeleton() {
  const { t } = useTranslation(["plans", "validation"]);
  return (
    <QuestionFormPattern
      header={<Heading level={1}>{t("plans:item.references")}</Heading>}
      questionIds={["a", "b", "c", "d"]}
      currentId={null}
      onCurrentChange={() => {}}
      isReadOnly
      renderQuestion={() => (
        <Stack gap="space-100">
          <Text variant="caption">{t("plans:home.empty")}</Text>
          <Text>{t("validation:questions.placeholder")}</Text>
        </Stack>
      )}
    />
  );
}

function PlanItemBody({
  ideaId,
  planId,
  itemNo,
  search,
}: {
  ideaId: string;
  planId: string;
  itemNo: number | null;
  search: PlanItemSearch;
}) {
  const { me, workspace } = useWorkspace();
  const home = useQuery(planHomeQuery(ideaId, planId, search.version));
  const isOurs =
    home.data !== undefined &&
    home.data.workspaceId === workspace.id &&
    home.data.ideaId === ideaId;
  const item = useQuery({
    ...planItemQuery(ideaId, planId, itemNo ?? 0, search.version),
    enabled: itemNo !== null && isOurs,
  });
  const isSlow = useIsSlow(
    home.isPending || (itemNo !== null && isOurs && item.isPending),
  );
  const failure = home.error ?? item.error;
  if (itemNo === null)
    return <NotFoundState dashboardHref={dashboardHref(me)} />;
  if (home.data !== undefined && home.data.workspaceId !== workspace.id) {
    // Another workspace's plan under this one's URL (SDD 4章).
    return <NoAccessState dashboardHref={dashboardHref(me)} />;
  }
  if (home.data !== undefined && home.data.ideaId !== ideaId) {
    // A plan of another idea of this workspace: no plan by that path (6.12).
    return <NotFoundState dashboardHref={dashboardHref(me)} />;
  }
  const retry = () => {
    void home.refetch();
    if (isOurs) void item.refetch();
  };
  if (home.data !== undefined && item.data !== undefined) {
    return (
      <ItemForm
        // Another item or version is another form: its sub-items, focus and end card.
        key={`${item.data.itemNo}:${search.version ?? ""}`}
        home={home.data}
        item={item.data}
        focusKey={search.q}
        versionId={search.version}
      />
    );
  }
  if (failure !== null) {
    return (
      <FailureState
        error={failure}
        onRetry={retry}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  if (isSlow) return <SlowLoadingState onRetry={retry} />;
  return (
    <Skeleton isLoading>
      <PlanItemSkeleton />
    </Skeleton>
  );
}

/**
 * 21 Plan item (design-spec 6.12, s11-form.html): pattern C with 11's parts. The item's
 * title with ▼ to switch items and how many of its sub-items are answered, its guidance
 * and references; each sub-item by its type (a text or choice, a table of rows, the
 * validation's numbers with Edit in validation, the execution items of a type) with its
 * Example; the previous and next items and AI ▼ in the bottom bar, or on a phone ← →
 * between the sub-items, the item's completion card and AI ▼ under the card. A Viewer,
 * an archived plan or idea and a saved version read it with every sub-item open.
 */
export function PlanItemScreen({
  ideaId,
  planId,
  itemParam,
  search,
}: {
  ideaId: string;
  planId: string;
  /** `$itemNo` as the URL has it. */
  itemParam: string;
  search: PlanItemSearch;
}) {
  const { t } = useTranslation(["ideas", "plans"]);
  const { workspace } = useWorkspace();
  const itemNo = itemNoOf(itemParam);
  const { data } = useQuery(planHomeQuery(ideaId, planId, search.version));
  const { data: ideaData } = useQuery(validationHomeQuery(ideaId));
  const home =
    data?.workspaceId === workspace.id && data.ideaId === ideaId
      ? data
      : undefined;
  const idea =
    ideaData?.idea.workspaceId === workspace.id ? ideaData.idea : undefined;
  // The body reads the same item: the panels name its sub-items and execution items.
  const item = useQuery({
    ...planItemQuery(ideaId, planId, itemNo ?? 0, search.version),
    enabled: itemNo !== null && home !== undefined,
  });
  const loaded = item.data;
  const title =
    loaded === undefined
      ? undefined
      : t("plans:home.item", { no: loaded.itemNo, title: loaded.title });
  useDocumentTitle(
    ...(title === undefined || home === undefined
      ? []
      : [title, home.name, workspace.name]),
  );
  const itemKey = itemNo === null ? "" : itemKeyOf(itemNo);
  // 21's comments and history are its item's sub-items' and its execution items' (SDD
  // 6.3「画面と節の対応」), with the idea's comments in the list. They wait for the item:
  // its execution types name the screen's sections, which a panel open must match.
  const comments: ScreenComments | undefined =
    home === undefined || idea === undefined || loaded === undefined
      ? undefined
      : {
          screen: {
            containerType: "business_plan",
            containerId: planId,
            sectionKeys: [
              itemKey,
              ...executionTypesOf(loaded.prompts).map(executionSectionKey),
            ],
          },
          // Both reads say whether the idea is archived; either may come back first.
          idea: {
            id: ideaId,
            name: idea.name,
            archived: idea.archived || home.ideaArchived,
          },
          plan: { id: planId, archived: home.archived },
          dataKey: ideaKey(ideaId),
          shows: (target) => {
            if (target.type === "plan_answer") {
              return (
                target.id === planId &&
                loaded.answers.some(
                  ({ questionKey }) => questionKey === target.key,
                )
              );
            }
            if (target.type === "execution_item") {
              return loaded.execution.some(({ id }) => id === target.id);
            }
            return false;
          },
          labelOf: (target) => {
            if (target.type === "idea") return idea.name;
            if (target.type === "plan_answer" && target.key != null) {
              return questionLabel(
                target.key,
                loaded.prompts.find(({ key }) => key === target.key)?.title,
              );
            }
            if (target.type === "execution_item") {
              const name = loaded.execution.find(
                ({ id }) => id === target.id,
              )?.title;
              return name === undefined
                ? undefined
                : rowLabel("execution_item", name);
            }
            return undefined;
          },
        };
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope={[
        planAnswerKey(planId, `P.${itemKey}.`),
        ...(loaded?.execution ?? []).map((entry) => executionKey(entry.id)),
      ]}
      comments={comments}
      history={comments}
      back={
        home === undefined
          ? { label: t("ideas:title"), href: ideasHref(workspace.id) }
          : {
              label: home.name,
              href: planHref(workspace.id, ideaId, planId, {
                version: search.version,
              }),
            }
      }
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {idea !== undefined && (
            <Breadcrumb href={ideaHref(workspace.id, ideaId)}>
              {idea.name}
            </Breadcrumb>
          )}
          {home !== undefined && (
            <Breadcrumb
              href={planHref(workspace.id, ideaId, planId, {
                version: search.version,
              })}
            >
              {home.name}
            </Breadcrumb>
          )}
          {title !== undefined && <Breadcrumb>{title}</Breadcrumb>}
        </Breadcrumbs>
      }
    >
      <PlanItemBody
        ideaId={ideaId}
        planId={planId}
        itemNo={itemNo}
        search={search}
      />
    </WorkspaceFrame>
  );
}
