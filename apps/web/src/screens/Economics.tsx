import {
  DEFAULT_OPERATING_DAYS,
  DEFAULT_TARGET_MARGIN,
  hasText,
} from "@moonx/domain";
import {
  formatInputNumber,
  formatInputPercent,
  formatMoney,
  formatPercent,
  i18n,
} from "@moonx/i18n";
import {
  type EconomicsField,
  type EconomicsInput,
  type EconomicsResult,
  economicsFieldSchema,
  type economicsSchema,
  numberTextSchema,
  operatingDaysSchema,
  percentToRate,
  rateToPercent,
  type ScenarioColumn,
  sellingPriceSchema,
  targetMarginInputSchema,
  unitsPerDaySchema,
  type ValidationHome,
} from "@moonx/schemas";
import {
  Breadcrumb,
  Breadcrumbs,
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
  MetricGroup,
  MetricTile,
  MoonGlyph,
  NumberField,
  QuestionCard,
  QuestionList,
  QuestionListItem,
  Skeleton,
  Stack,
  type TableColumn,
  TableView,
  Text,
  useFauLabel,
  useIsNarrow,
  WorksheetPattern,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import {
  AnswerEvidenceSheet,
  AnswerFields,
  type AnswersCache,
  answerKey,
  moonOf,
  useAnswers,
} from "../components/AnswerFields";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import { ModalBoundary } from "../components/ErrorBoundary";
import { EvidenceSheet } from "../components/EvidenceSheet";
import { ItemHistoryButton } from "../components/HistoryPanel";
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
  type NumberView,
  numberKey,
  settleUnknown,
  unknownWaits,
  useWorksheet,
} from "../components/worksheet";
import {
  dashboardHref,
  useModal,
  usePanel,
  useWorkspace,
} from "../components/workspace";
import { api, inPath, unwrap } from "../lib/api";
import type { SaveTarget } from "../lib/autosave";
import { useAutosave } from "../lib/autosave-react";
import { inputIssueMessage } from "../lib/input-issues";
import { economicsLabel, questionLabel } from "../lib/item-labels";
import {
  costsHref,
  type EconomicsSearch,
  ideaHref,
  ideasHref,
} from "../lib/links";
import { costTotalText, type MetricFormat, metricText } from "../lib/metrics";
import { useIsOnline } from "../lib/online";
import {
  economicsQuery,
  ideaKey,
  putSaved,
  validationHomeQuery,
  workspaceKey,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

export type { EconomicsSearch };

type Economics = z.infer<typeof economicsSchema>;
type EconomicsKey = ReturnType<typeof economicsQuery>["queryKey"];

/** The question 18 asks under the numbers (design-spec 6.4「入力」). */
const WORTH = "V.08.WORTH";

/** The numbers of the Inputs table and of the Daily sales table (design-spec 6.4). */
const INPUT_FIELDS = [
  "selling_price",
  "operating_days",
  "target_margin",
] as const;
const SALES_FIELDS = [
  "units_conservative",
  "units_expected",
  "units_strong",
  "units_capacity",
] as const;

/** M2's `about` for a number (SDD 4章): the validation, keyed by the field. */
const aboutOf = (validationId: string, field: EconomicsField) =>
  `economics_input:${validationId}:${field}`;

/** Puts a number, as saved, in 18's data. */
function putNumber(
  queryClient: QueryClient,
  dataKey: EconomicsKey,
  input: Partial<EconomicsInput> & { fieldKey: EconomicsField },
) {
  putSaved<Economics>(queryClient, dataKey, (data) =>
    data === undefined
      ? undefined
      : {
          ...data,
          inputs: data.inputs.map((current) =>
            current.fieldKey === input.fieldKey
              ? { ...current, ...input }
              : current,
          ),
        },
  );
}

/** The save of a number (V16 PUT), the first one making it at version 1. */
function numberTarget(
  queryClient: QueryClient,
  ideaId: string,
  workspaceId: string,
  dataKey: EconomicsKey,
  validationId: string,
  field: EconomicsField,
  noun: string,
): SaveTarget {
  return {
    key: numberKey(validationId, field),
    noun,
    send: async (fields, lockVersion, force) => {
      // V16 takes the value with every save: a save of F/A/U alone keeps the one saved,
      // but Unknown has none.
      const value = Object.hasOwn(fields, "value")
        ? (fields.value as number | null)
        : unknownWaits(fields)
          ? null
          : (queryClient
              .getQueryData(dataKey)
              ?.inputs.find(({ fieldKey }) => fieldKey === field)?.value ??
            null);
      const input = await unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .economics({ fieldKey: field })
          .put({
            ...settleUnknown({ ...fields, value }, ["value"]),
            value,
            lockVersion,
            ...(force ? { force } : {}),
          }),
      );
      putNumber(queryClient, dataKey, input);
      // 13's numbers and checks, 17's break-even, 19 and the lists of ideas read them.
      void queryClient.invalidateQueries({
        queryKey: ideaKey(ideaId),
        refetchType: "none",
      });
      void queryClient.invalidateQueries({
        queryKey: workspaceKey(workspaceId),
        refetchType: "none",
      });
      return input.lockVersion;
    },
    loadTheirs: () => void queryClient.invalidateQueries({ queryKey: dataKey }),
  };
}

/** The rule of each number as typed (design-spec 6.0.8): a % is typed as 15 for 15%. */
const typedSchemas = {
  selling_price: numberTextSchema(sellingPriceSchema),
  operating_days: numberTextSchema(operatingDaysSchema),
  target_margin: numberTextSchema(targetMarginInputSchema),
  units_conservative: numberTextSchema(unitsPerDaySchema),
  units_expected: numberTextSchema(unitsPerDaySchema),
  units_strong: numberTextSchema(unitsPerDaySchema),
  units_capacity: numberTextSchema(unitsPerDaySchema),
} as const satisfies Record<EconomicsField, unknown>;

/** A number as its field holds it: the text typed, blank for none. */
interface NumberValues {
  value: string;
}

/** The text a field shows for a stored number: the target margin as its %. */
const typedOf = (field: EconomicsField, value: number | null) =>
  value === null
    ? ""
    : formatInputNumber(
        field === "target_margin" ? rateToPercent(value) : value,
      );

const isBlank = (text: string) => text.trim() === "";

/**
 * A number's rule and how it travels (6.0.8, SDD 5.7 V16). V16 always takes the value, so
 * every save sends it.
 */
const numberSpec = (view: NumberView): RowFieldsSpec<NumberValues> => {
  const field = view.input.fieldKey;
  const schema = typedSchemas[field];
  return {
    errorOf: (_, value) => {
      if (isBlank(value)) return undefined;
      const [issue] = schema.safeParse(value).error?.issues ?? [];
      return issue === undefined ? undefined : inputIssueMessage(issue);
    },
    toWire: (_, value) => {
      if (isBlank(value)) return null;
      const number = schema.parse(value);
      return field === "target_margin" ? percentToRate(number) : number;
    },
    fromWire: (_, value) =>
      typedOf(field, typeof value === "number" ? value : null) as never,
    isChoice: () => false,
  };
};

/** A number's input field, in place or in the phone's sheet. */
function NumberInput({
  view,
  target,
  label,
  autoFocus = false,
}: {
  view: NumberView;
  target: SaveTarget;
  /** Its visible label, in the phone's sheet; the table's row names it there. */
  label?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const field = view.input.fieldKey;
  const fields = useRowFields<NumberValues>(
    target,
    view.input.lockVersion,
    { value: typedOf(field, view.input.value) },
    numberSpec(view),
  );
  const name = t(`common:economicsField.${field}`);
  return (
    <NumberField
      {...(label === undefined
        ? { "aria-label": t("validation:economics.label.value", { name }) }
        : { label })}
      {...(field === "selling_price"
        ? { currency: workspace.currency }
        : field === "target_margin"
          ? { isPercent: true }
          : {})}
      isInteger={field === "operating_days"}
      placeholder={
        field === "operating_days"
          ? formatInputNumber(DEFAULT_OPERATING_DAYS)
          : field === "target_margin"
            ? formatInputNumber(rateToPercent(DEFAULT_TARGET_MARGIN))
            : undefined
      }
      value={fields.values.value}
      onChange={(value) => fields.change("value", value)}
      onBlur={() => fields.blur("value")}
      errorMessage={fields.errors.value}
      isReadOnly={!isOnline}
      autoFocus={autoFocus}
      width="full"
    />
  );
}

/**
 * A number as 18 shows it (design-spec 6.4「入力」): the price as an amount, the target
 * margin as the % typed, daily sales as typed; the default of operating days and the
 * target margin faintly while they have no value; "Unknown" or "Empty".
 */
function NumberText({ view }: { view: NumberView }) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  const field = view.input.fieldKey;
  if (view.value !== null) {
    switch (field) {
      case "selling_price":
        return (
          <>
            {formatMoney(view.value, workspace.currency, {
              cents: !Number.isInteger(view.value),
            })}
          </>
        );
      case "target_margin":
        return <>{formatInputPercent(view.value)}</>;
      default:
        return <>{formatInputNumber(view.value)}</>;
    }
  }
  if (view.state !== "unknown" && field === "operating_days") {
    return (
      <Text variant="number" tone="tertiary">
        {t("validation:economics.default", {
          value: formatInputNumber(DEFAULT_OPERATING_DAYS),
        })}
      </Text>
    );
  }
  if (view.state !== "unknown" && field === "target_margin") {
    return (
      <Text variant="number" tone="tertiary">
        {t("validation:economics.default", {
          value: formatInputPercent(DEFAULT_TARGET_MARGIN),
        })}
      </Text>
    );
  }
  return (
    <Text variant="number" tone="tertiary">
      {t(`common:fauState.${view.state === "unknown" ? "unknown" : "empty"}`)}
    </Text>
  );
}

/**
 * A number in a phone's sheet (design-spec 6.4: F/A/U is set with the buttons in the row's
 * sheet). A Viewer and an archived idea read it.
 */
function NumberSheet({
  view,
  target,
  canEdit,
  onFau,
  onFact,
  onComments,
  onHistory,
  onClose,
}: {
  view: NumberView;
  target: SaveTarget;
  canEdit: boolean;
  onFau: (change: FauChange) => void;
  onFact: () => void;
  /** The number's 💬: the sheet closes and its thread opens in the panel. */
  onComments: () => void;
  /** The number's 🕘: the sheet closes and its changes open in the panel. */
  onHistory: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const isOnline = useIsOnline();
  const name = t(`common:economicsField.${view.input.fieldKey}`);
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      size="M"
      title={canEdit ? t("validation:economics.editTitle", { name }) : name}
    >
      <Stack gap="space-300">
        <Flex justifyContent="end">
          <ItemCommentsButton
            label={economicsLabel(view.input.fieldKey)}
            count={view.input.commentCount}
            onPress={onComments}
          />
          <ItemHistoryButton
            label={economicsLabel(view.input.fieldKey)}
            onPress={onHistory}
          />
        </Flex>
        {canEdit ? (
          <>
            <SaveFailureNote itemKey={target.key} />
            <NumberInput view={view} target={target} label={name} autoFocus />
          </>
        ) : (
          <DescriptionList>
            <DescriptionListItem label={name}>
              <NumberText view={view} />
            </DescriptionListItem>
          </DescriptionList>
        )}
        <FauPicker
          aria-label={t("validation:economics.label.fau", { name })}
          state={view.state}
          confidence={view.confidence}
          evidenceCount={view.counted}
          hasValue={view.hasValue}
          isReadOnly={!canEdit || !isOnline}
          onChange={onFau}
          onFactPress={onFact}
        />
      </Stack>
    </Dialog>
  );
}

/** The format of each scenario figure (design-spec 6.4「端数」). */
const SCENARIO_METRICS = [
  "unitsPerDay",
  "unitsPerMonth",
  "revenue",
  "variableCostTotal",
  "operatingProfit",
  "operatingMargin",
] as const satisfies readonly (keyof ScenarioColumn)[];

type ScenarioMetric = (typeof SCENARIO_METRICS)[number];

const formatOf = (
  metric: ScenarioMetric,
  column: ScenarioColumn,
): MetricFormat => {
  switch (metric) {
    case "unitsPerDay":
      // Typed daily sales show as typed; break-even's are calculated.
      return column.key === "break_even" ? "units" : "typedUnits";
    case "unitsPerMonth":
      return "units";
    case "operatingMargin":
      return "percent";
    default:
      return "money";
  }
};

/**
 * The scenarios in the results (design-spec 6.4「計算仕様」, 4.1 F): break-even and the
 * four scenarios, a line each with its figures under its name, as a phone shows them at
 * every width (the six columns do not fit the results' card). An empty scenario reads
 * "Empty", never 0; a loss shows as one.
 */
function ScenarioTable({ result }: { result: EconomicsResult }) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  const scenarioName = (column: ScenarioColumn) =>
    t(`common:scenario.${column.key}`);
  const columns: TableColumn[] = [
    {
      id: "name",
      name: t("validation:economics.scenarioColumn"),
      isRowHeader: true,
    },
    ...SCENARIO_METRICS.map((metric) => ({
      id: metric,
      name: t(`validation:economics.metric.${metric}`),
      numeric: true,
    })),
  ];
  return (
    <TableView
      aria-label={t("validation:economics.scenarios")}
      layout="cards"
      density="compact"
      columns={columns}
      items={result.scenarios.map((column) => ({ id: column.key, column }))}
      textValue={({ column }) => scenarioName(column)}
      renderCell={({ column }, id) =>
        id === "name"
          ? scenarioName(column)
          : metricText(
              column[id as ScenarioMetric],
              formatOf(id as ScenarioMetric, column),
              workspace.currency,
            )
      }
    />
  );
}

/** The words of a warning of the results (design-spec 6.4). */
function warningText(warning: EconomicsResult["warnings"][number]): string {
  const t = i18n.t.bind(i18n);
  switch (warning) {
    case "margin_not_positive":
    case "target_margin_unreachable":
      return t(`common:metricReason.${warning}`);
    case "costs_incomplete":
    case "break_even_above_capacity":
      return t(`validation:economics.warning.${warning}`);
    case "conservative_exceeds_capacity":
      return t("validation:economics.warning.exceeds_capacity", {
        scenario: t("common:scenario.conservative"),
      });
    case "expected_exceeds_capacity":
      return t("validation:economics.warning.exceeds_capacity", {
        scenario: t("common:scenario.expected"),
      });
    case "strong_exceeds_capacity":
      return t("validation:economics.warning.exceeds_capacity", {
        scenario: t("common:scenario.strong"),
      });
  }
}

/** The warnings over the results (design-spec 6.4「Capacity 警告」「下限の伝播」・状態). */
function Warnings({ result }: { result: EconomicsResult }) {
  const { t } = useTranslation(["validation"]);
  const lines = result.warnings.map(warningText);
  if (lines.length === 0) return null;
  return (
    <InlineAlert variant="notice" title={t("validation:economics.warnings")}>
      <Stack gap="space-75">
        {lines.map((line) => (
          <Text key={line} variant="body-sm">
            {line}
          </Text>
        ))}
      </Stack>
    </InlineAlert>
  );
}

/**
 * The results (design-spec 6.4): variable cost and contribution per sale, break-even, the
 * units for the target margin, Expected profit, payback and ROI, each with its bound or
 * why it cannot be calculated; the defaults in use; the warnings over them.
 */
function Results({
  result,
  targetMargin,
}: {
  result: EconomicsResult;
  /** The target margin in use: the one entered, else the default. */
  targetMargin: number;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const { workspace } = useWorkspace();
  const { currency } = workspace;
  const tile = (
    label: string,
    metric: EconomicsResult["breakEvenUnitsDay"],
    format: MetricFormat,
    unit?: string,
    supplement?: ReactNode,
  ) => (
    <MetricTile
      label={label}
      value={metricText(metric, format, currency)}
      unit={metric.value === null ? undefined : unit}
      isPlaceholder={metric.value === null}
      supplement={supplement}
    />
  );
  const expected = result.scenarios.find(({ key }) => key === "expected");
  const breakEvenMore =
    result.breakEvenUnitsMonth.value === null
      ? undefined
      : t("validation:economics.breakEvenMore", {
          units: metricText(result.breakEvenUnitsMonth, "units", currency),
          revenue: metricText(result.breakEvenRevenue, "money", currency),
        });
  const margin = formatInputPercent(DEFAULT_TARGET_MARGIN);
  const targetMore =
    result.targetMarginUnitsMonth.value === null
      ? undefined
      : t("validation:economics.targetMore", {
          units: metricText(result.targetMarginUnitsMonth, "units", currency),
          margin: formatInputPercent(targetMargin),
        });
  return (
    <Stack gap="space-200">
      <Warnings result={result} />
      <MetricGroup
        aria-label={t("validation:economics.results")}
        variant="column"
      >
        {tile(
          t("validation:economics.result.variableCost"),
          result.variableCostPerUnit,
          "moneyCents",
        )}
        {tile(
          t("validation:economics.result.contribution"),
          result.contributionMargin,
          "moneyCents",
          undefined,
          result.contributionMarginRate.value === null
            ? undefined
            : t("validation:economics.contributionRate", {
                rate: formatPercent(result.contributionMarginRate.value, {
                  bound: result.contributionMarginRate.bound,
                }),
              }),
        )}
        {tile(
          t("validation:economics.result.breakEven"),
          result.breakEvenUnitsDay,
          "units",
          t("validation:economics.unit.perDay"),
          breakEvenMore,
        )}
        {tile(
          t("validation:economics.result.targetMargin"),
          result.targetMarginUnitsDay,
          "units",
          t("validation:economics.unit.perDay"),
          targetMore,
        )}
        {expected !== undefined &&
          tile(
            t("validation:economics.result.expectedProfit"),
            expected.operatingProfit,
            "money",
            t("validation:economics.unit.perMonth"),
          )}
        {tile(
          t("validation:economics.result.payback"),
          result.paybackMonths,
          "months",
        )}
        {tile(
          t("validation:economics.result.roi"),
          result.simpleRoi,
          "percent",
          t("validation:economics.unit.perYear"),
        )}
      </MetricGroup>
      {result.defaultsUsed.operatingDays && (
        <Text variant="caption" tone="secondary">
          {t("validation:economics.usingDefaultDays", {
            days: formatInputNumber(DEFAULT_OPERATING_DAYS),
          })}
        </Text>
      )}
      {result.defaultsUsed.targetMargin && (
        <Text variant="caption" tone="secondary">
          {t("validation:economics.usingDefaultMargin", { margin })}
        </Text>
      )}
      <Stack gap="space-100">
        <Heading level={3} variant="label">
          {t("validation:economics.scenarios")}
        </Heading>
        <ScenarioTable result={result} />
      </Stack>
    </Stack>
  );
}

/** The summary bar (design-spec 6.4): "BE 6.9/day · Exp ₱18,490/mo". */
function ResultsSummary({ result }: { result: EconomicsResult }) {
  const { t } = useTranslation(["validation"]);
  const { workspace } = useWorkspace();
  const expected = result.scenarios.find(({ key }) => key === "expected");
  const pairs: [string, string, string][] = [
    [
      t("validation:economics.summary.breakEven"),
      metricText(result.breakEvenUnitsDay, "units", workspace.currency),
      result.breakEvenUnitsDay.value === null
        ? ""
        : t("validation:economics.summary.perDay"),
    ],
    ...(expected === undefined
      ? []
      : [
          [
            t("validation:economics.summary.expected"),
            metricText(expected.operatingProfit, "money", workspace.currency),
            expected.operatingProfit.value === null
              ? ""
              : t("validation:economics.summary.perMonth"),
          ] as [string, string, string],
        ]),
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

/** The element of the worth question, for `?q=` to focus. */
const WORTH_ID = "worth-question";

const NO_INPUTS: Economics["inputs"] = [];
const NO_ROWS: Economics["costItems"] = [];

function EconomicsBody({
  home,
  search,
  modal,
  about,
}: {
  home: ValidationHome;
  search: EconomicsSearch;
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
  const fauLabel = useFauLabel();
  const forFact = useRouterState({
    select: (state) => state.location.state.evidenceForFact === true,
  });
  const { idea, validationId } = home;
  const canEdit = role !== "viewer" && !idea.archived;
  const data = economicsQuery(idea.id, validationId);
  const query = useQuery(data);
  const isSlow = useIsSlow(query.isPending);
  const { numbers, result } = useWorksheet(
    validationId,
    query.data?.costItems ?? NO_ROWS,
    query.data?.inputs ?? NO_INPUTS,
  );
  const [sheetField, setSheetField] = useState<EconomicsField | null>(null);
  const [editRequest, setEditRequest] = useState<{
    key: string;
    columnId: string;
  } | null>(null);
  const [isWorthOpen, setWorthOpen] = useState(search.q === WORTH);

  const targetOf = (field: EconomicsField) =>
    numberTarget(
      queryClient,
      idea.id,
      workspace.id,
      data.queryKey,
      validationId,
      field,
      t("validation:economics.noun"),
    );
  const classify = (view: NumberView, change: FauChange) => {
    const field = view.input.fieldKey;
    // V16 takes the value with every save: the one showing, none for Unknown.
    autosave.change(targetOf(field), view.input.lockVersion, {
      value: change.fau === "unknown" ? null : view.value,
      classification:
        change.fau === "unknown"
          ? { fau: "unknown", confidence: null }
          : change,
    });
    autosave.flush(numberKey(validationId, field));
  };
  const openEvidence = (view: NumberView, isFact: boolean) =>
    modals.open("evidence", {
      about: aboutOf(validationId, view.input.fieldKey),
      forFact: isFact,
    });
  const openNumber = (field: EconomicsField) => {
    if (isPhone) setSheetField(field);
    else setEditRequest({ key: field, columnId: "value" });
  };

  const cache: AnswersCache = {
    get: (questionKey) =>
      questionKey === WORTH
        ? queryClient.getQueryData(data.queryKey)?.worth
        : undefined,
    update: (questionKey, change) => {
      if (questionKey !== WORTH) return;
      putSaved<Economics>(queryClient, data.queryKey, (current) =>
        current === undefined
          ? undefined
          : { ...current, worth: change(current.worth) },
      );
    },
    reload: () =>
      void queryClient.invalidateQueries({ queryKey: data.queryKey }),
  };
  const answers = useAnswers(validationId, cache, (questionKey, isFact) =>
    modals.open("evidence", {
      about: `validation_answer:${validationId}:${questionKey}`,
      forFact: isFact,
    }),
  );

  // A link to a number (`?field=`) opens it, and one to the worth question (`?q=`) opens
  // and focuses it, once the numbers are read.
  const linked = useRef<string | null>(null);
  const linkKey = `${search.field ?? ""}|${search.q ?? ""}`;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  useEffect(() => {
    if (query.data === undefined || linked.current === linkKey) return;
    linked.current = linkKey;
    if (search.field !== undefined) {
      openNumber(search.field);
      return;
    }
    if (search.q === WORTH && query.data.worthQuestion !== null) {
      setWorthOpen(true);
      // After the card opened: the field is in it from the next frame. A Viewer's open
      // question is scrolled to instead.
      requestAnimationFrame(() => {
        const card = document.getElementById(WORTH_ID);
        if (!canEditRef.current) {
          card?.scrollIntoView({ block: "center" });
          return;
        }
        card?.querySelector<HTMLElement>("textarea:not([readonly])")?.focus();
      });
    }
  });

  // Leaving 18 sends what waits (design-spec 6.0.2「画面を離れるとき」).
  useEffect(
    () => () => {
      for (const field of economicsFieldSchema.options) {
        autosave.flush(numberKey(validationId, field));
      }
      autosave.flush(answerKey(validationId, WORTH));
    },
    [autosave, validationId],
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

  // The screen's UI display name (design-spec 3章: headings take it; 13's list and the
  // section switch take the short "06–08 Unit Economics").
  const title = t("validation:economics.title");
  const header = (
    <Stack gap="space-200">
      {idea.archived && <ArchivedIdeaAlert ideaId={idea.id} />}
      <Flex columnGap="space-300" rowGap="space-100" alignItems="baseline" wrap>
        <SectionTitle ideaId={idea.id} sections={home.sections} title={title} />
        <Text tone="secondary">{t("validation:economics.lead")}</Text>
      </Flex>
    </Stack>
  );

  if (query.data === undefined) {
    return isSlow ? (
      <SlowLoadingState onRetry={() => void query.refetch()} />
    ) : (
      <Skeleton isLoading>
        <EconomicsSkeleton header={header} />
      </Skeleton>
    );
  }

  const viewOf = (field: EconomicsField) =>
    numbers.find(({ input }) => input.fieldKey === field);
  const columns: TableColumn[] = [
    { id: "mark", name: t("validation:economics.column.mark"), isMark: true },
    {
      id: "name",
      name: t("validation:economics.column.name"),
      isRowHeader: true,
      width: "36%",
    },
    {
      id: "value",
      name: t("validation:economics.column.value"),
      numeric: true,
      width: 150,
    },
    {
      id: "fau",
      name: t("validation:economics.column.fau"),
      isBelowName: true,
    },
    // Each number's 💬 and 🕘 (design-spec 6.0.4・6.0.5); a phone's row opens its sheet,
    // which has them.
    {
      id: "more",
      name: t("validation:economics.column.more"),
      isRowActions: true,
    },
  ];
  const numberItem = (field: EconomicsField) =>
    ({
      kind: "item",
      item: { type: "economics_input", id: validationId, key: field },
    }) as const;
  const showComments = (field: EconomicsField) =>
    panel.show("comments", numberItem(field));
  const showHistory = (field: EconomicsField) =>
    panel.show("history", numberItem(field));
  const table = (
    label: string,
    unit: string | null,
    fields: readonly EconomicsField[],
  ) => (
    <Stack gap="space-100">
      <Flex gap="space-200" alignItems="baseline">
        <Heading level={2} variant="heading-4">
          {label}
        </Heading>
        {unit !== null && (
          <Text variant="caption" tone="secondary">
            {unit}
          </Text>
        )}
      </Flex>
      <TableView
        aria-label={label}
        columns={columns}
        items={fields.flatMap((field) => {
          const view = viewOf(field);
          return view === undefined ? [] : [{ id: field, view }];
        })}
        textValue={({ id }) => t(`common:economicsField.${id}`)}
        isRowEditable={() => canEdit}
        onRowAction={(key) => setSheetField(key as EconomicsField)}
        editRequest={editRequest}
        onEditRequestMet={() => setEditRequest(null)}
        renderCell={({ id, view }, column, { isEditing, isCard }) => {
          const name = t(`common:economicsField.${id}`);
          switch (column) {
            case "mark":
              return <MoonGlyph state={moonOf[view.state]} size="S" />;
            case "name":
              return (
                <Stack gap="space-75">
                  <Flex gap="space-100" alignItems="center" wrap>
                    {name}
                    {isCard ? (
                      // A phone's row presses as a whole and holds no buttons.
                      <Text variant="caption" tone="secondary">
                        <CommentCount count={view.input.commentCount} />
                      </Text>
                    ) : (
                      view.input.commentCount > 0 && (
                        <ItemCommentsButton
                          label={economicsLabel(id)}
                          count={view.input.commentCount}
                          onPress={() => showComments(id)}
                        />
                      )
                    )}
                  </Flex>
                  {canEdit && !isCard && (
                    <SaveFailureNote itemKey={numberKey(validationId, id)} />
                  )}
                </Stack>
              );
            case "more":
              return (
                <Flex gap="space-25" alignItems="center">
                  <ItemCommentsButton
                    label={economicsLabel(id)}
                    count={view.input.commentCount}
                    onPress={() => showComments(id)}
                  />
                  <ItemHistoryButton
                    label={economicsLabel(id)}
                    onPress={() => showHistory(id)}
                  />
                </Flex>
              );
            case "value":
              return isEditing ? (
                <NumberInput view={view} target={targetOf(id)} />
              ) : (
                <NumberText view={view} />
              );
            default:
              return (
                <FauPicker
                  aria-label={t("validation:economics.label.fau", { name })}
                  state={view.state}
                  confidence={view.confidence}
                  evidenceCount={view.counted}
                  hasValue={view.hasValue}
                  isReadOnly={!canEdit || isCard || !isOnline}
                  onChange={(change) => classify(view, change)}
                  onFactPress={() => openEvidence(view, true)}
                />
              );
          }
        }}
      />
    </Stack>
  );

  const { worth, worthQuestion } = query.data;
  const worthView =
    worthQuestion === null || worth.hidden
      ? null
      : answers.viewOf(worthQuestion, worth);
  const worthMode = !canEdit ? "open" : isWorthOpen ? "focused" : "quiet";
  const worthItem = {
    kind: "item",
    item: { type: "validation_answer", id: validationId, key: WORTH },
  } as const;
  const costs = (
    <Stack gap="space-100">
      <Heading level={2} variant="heading-4">
        {t("validation:economics.costs")}
      </Heading>
      <Flex columnGap="space-200" rowGap="space-75" alignItems="baseline" wrap>
        <Text tone="secondary">
          {t("validation:economics.costsLine", {
            startup: costTotalText(result.totals.initial, workspace.currency),
            monthly: costTotalText(
              result.totals.monthlyFixed,
              workspace.currency,
            ),
            variable: metricText(
              result.variableCostPerUnit,
              "moneyCents",
              workspace.currency,
            ),
          })}
        </Text>
        <Link href={costsHref(workspace.id, idea.id)}>
          <Flex gap="space-50" alignItems="center">
            {t("validation:economics.toCosts")}
            <ArrowRight aria-hidden size={14} />
          </Flex>
        </Link>
      </Flex>
    </Stack>
  );

  const sheetView = sheetField === null ? undefined : viewOf(sheetField);
  const evidenceNumber =
    modal === "evidence" && canEdit
      ? numbers.find(
          ({ input }) => aboutOf(validationId, input.fieldKey) === about,
        )
      : undefined;
  const evidenceWorth =
    modal === "evidence" &&
    canEdit &&
    about === `validation_answer:${validationId}:${WORTH}` &&
    worthView !== null &&
    worthView.state !== null
      ? { ...worthView, state: worthView.state }
      : null;

  return (
    <>
      <WorksheetPattern
        header={header}
        inputs={
          <Stack gap="space-500">
            {table(t("validation:economics.inputs"), null, INPUT_FIELDS)}
            {table(
              t("validation:economics.dailySales"),
              t("validation:economics.dailySalesUnit"),
              SALES_FIELDS,
            )}
            {costs}
            {worthView !== null && worthQuestion !== null && (
              <QuestionList>
                <QuestionListItem>
                  <QuestionCard
                    id={WORTH_ID}
                    title={worthQuestion.title}
                    question={worthQuestion.prompt}
                    headingLevel={2}
                    mode={worthMode}
                    status={
                      worthView.state === null
                        ? undefined
                        : {
                            state: moonOf[worthView.state],
                            label: fauLabel(worthView.state, {
                              confidence: worthView.confidence,
                              evidenceCount: worthView.counted,
                            }),
                            isWarning: worthView.state === "fact_no_evidence",
                          }
                    }
                    excerpt={hasText(worthView.text) ? worthView.text : null}
                    commentCount={worth.commentCount}
                    actions={
                      <>
                        <ItemCommentsButton
                          label={questionLabel(
                            worthQuestion.key,
                            worthQuestion.title,
                          )}
                          count={worth.commentCount}
                          onPress={() => panel.show("comments", worthItem)}
                        />
                        <ItemHistoryButton
                          label={questionLabel(
                            worthQuestion.key,
                            worthQuestion.title,
                          )}
                          onPress={() => panel.show("history", worthItem)}
                        />
                      </>
                    }
                    onFocusRequest={() => setWorthOpen(true)}
                  >
                    {worthMode === "quiet" ? undefined : (
                      <AnswerFields
                        view={worthView}
                        answers={answers}
                        validationId={validationId}
                        ideaId={idea.id}
                        canEdit={canEdit}
                      />
                    )}
                  </QuestionCard>
                </QuestionListItem>
              </QuestionList>
            )}
          </Stack>
        }
        resultsTitle={t("validation:economics.results")}
        results={
          <Results
            result={result}
            targetMargin={
              viewOf("target_margin")?.value ?? DEFAULT_TARGET_MARGIN
            }
          />
        }
        summary={<ResultsSummary result={result} />}
      />
      {sheetView !== undefined && (
        <NumberSheet
          view={sheetView}
          target={targetOf(sheetView.input.fieldKey)}
          canEdit={canEdit}
          onFau={(change) => classify(sheetView, change)}
          onFact={() => openEvidence(sheetView, true)}
          onComments={() => {
            setSheetField(null);
            showComments(sheetView.input.fieldKey);
          }}
          onHistory={() => {
            setSheetField(null);
            showHistory(sheetView.input.fieldKey);
          }}
          onClose={() => setSheetField(null)}
        />
      )}
      {evidenceNumber !== undefined && (
        <ModalBoundary key="evidence" onClose={modals.close}>
          <EvidenceSheet
            ideaId={idea.id}
            validationId={validationId}
            item={{
              target: {
                type: "economics_input",
                id: validationId,
                key: evidenceNumber.input.fieldKey,
              },
              label: t("common:itemLabel.row", {
                list: t("common:itemLabel.list.economics_input"),
                text: t(
                  `common:economicsField.${evidenceNumber.input.fieldKey}`,
                ),
              }),
              noun: t("validation:economics.noun"),
              evidence: evidenceNumber.input.classification.evidence,
              state: evidenceNumber.state,
              hasValue: evidenceNumber.hasValue,
            }}
            lockVersionNow={() =>
              queryClient
                .getQueryData(data.queryKey)
                ?.inputs.find(
                  ({ fieldKey }) => fieldKey === evidenceNumber.input.fieldKey,
                )?.lockVersion ?? evidenceNumber.input.lockVersion
            }
            saveKey={numberKey(validationId, evidenceNumber.input.fieldKey)}
            forFact={forFact}
            onChanged={(change) =>
              putNumber(queryClient, data.queryKey, {
                fieldKey: evidenceNumber.input.fieldKey,
                classification: change.classification,
                lockVersion: change.lockVersion,
              })
            }
            onMarkFact={() =>
              classify(evidenceNumber, { fau: "fact", confidence: null })
            }
            onReload={() =>
              void queryClient.invalidateQueries({ queryKey: data.queryKey })
            }
            onClose={modals.close}
          />
        </ModalBoundary>
      )}
      {evidenceWorth !== null && worthQuestion !== null && (
        <ModalBoundary key="evidence" onClose={modals.close}>
          <AnswerEvidenceSheet
            ideaId={idea.id}
            validationId={validationId}
            view={evidenceWorth}
            label={[
              t("common:itemLabel.question", {
                section: "08",
                title: worthQuestion.title,
              }),
              worthQuestion.prompt,
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
 * 18's shape while it loads (design-spec 6.0.6). Drawn inside a `Skeleton`, its words are
 * bars.
 */
export function EconomicsSkeleton({ header }: { header?: ReactNode } = {}) {
  const { t } = useTranslation(["validation"]);
  return (
    <WorksheetPattern
      header={
        header ?? <Heading level={1}>{t("validation:economics.title")}</Heading>
      }
      inputs={
        <Stack gap="space-500">
          {[
            t("validation:economics.inputs"),
            t("validation:economics.dailySales"),
          ].map((label) => (
            <Stack key={label} gap="space-100">
              <Heading level={2} variant="heading-4">
                {label}
              </Heading>
              {[0, 1, 2].map((row) => (
                <Text key={row}>{label}</Text>
              ))}
            </Stack>
          ))}
        </Stack>
      }
      resultsTitle={t("validation:economics.results")}
      results={null}
      summary={null}
    />
  );
}

/**
 * 18 Unit Economics & Scenarios (design-spec 6.4): pattern F, as 17. The price, operating
 * days, target margin and the four scenarios' daily sales in place (in a sheet on a
 * phone), each with its F/A/U; the costs from 17; the scenarios; "Is the return worth the
 * capital and effort?"; and the results beside them, calculated again as they are typed.
 */
export function EconomicsScreen({
  ideaId,
  search,
  modal,
  about,
}: {
  ideaId: string;
  search: EconomicsSearch;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["ideas", "validation"]);
  const { me, workspace } = useWorkspace();
  const home = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(home.isPending);
  const data =
    home.data?.idea.workspaceId === workspace.id ? home.data : undefined;
  const title =
    data === undefined ? undefined : t("validation:economics.title");
  // The body reads the same numbers: the panel names WORTH by its title.
  const numbers = useQuery({
    ...economicsQuery(ideaId, data?.validationId ?? ""),
    enabled: data !== undefined,
  });
  const comments: ScreenComments | undefined =
    data === undefined
      ? undefined
      : {
          screen: {
            containerType: "validation",
            containerId: data.validationId,
            sectionKeys: ["08", "economics"],
          },
          idea: {
            id: ideaId,
            name: data.idea.name,
            archived: data.idea.archived,
          },
          shows: (item) =>
            item.id === data.validationId &&
            (item.type === "economics_input"
              ? economicsFieldSchema.safeParse(item.key).success
              : item.type === "validation_answer" &&
                (item.key ?? "").startsWith("V.08.") &&
                (numbers.data === undefined ||
                  numbers.data.worthQuestion?.key === item.key)),
          labelOf: (target) => {
            if (target.type === "idea") return data.idea.name;
            if (target.key == null) return undefined;
            if (target.type === "validation_answer") {
              const question = numbers.data?.worthQuestion;
              return questionLabel(
                target.key,
                question?.key === target.key ? question.title : undefined,
              );
            }
            const field = economicsFieldSchema.safeParse(target.key);
            return field.success ? economicsLabel(field.data) : undefined;
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
      <EconomicsBody home={data} search={search} modal={modal} about={about} />
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
        <EconomicsSkeleton />
      </Skeleton>
    );
  }
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope={
        data === undefined
          ? "economics_input:"
          : ["economics_input:", answerKey(data.validationId, WORTH)]
      }
      comments={comments}
      history={
        comments && {
          ...comments,
          hasFau: (key) =>
            numbers.data?.worthQuestion?.key === key
              ? numbers.data.worthQuestion.hasFau
              : true,
        }
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
