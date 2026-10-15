import {
  type CheckKey,
  type CheckMissing,
  type CheckResult,
  type CheckState,
  type Confidence,
  costCategorySchema,
  type EconomicsField,
  type EconomicsResult,
  economicsFieldSchema,
  type Fau,
  type FauBreakdown,
  type FauState,
  type KeyMetrics,
  type LinkTarget,
  type NextStep,
  type SupportsCheck,
  type TemplateQuestion,
  type TemplateSection,
  type UUID,
} from "@moonx/schemas";
import {
  buildKeyMetrics,
  type CostRowInput,
  computeEconomics,
  type EconomicsInput,
  rowHasValue,
} from "./economics";
import { countFau, fauState, hasText } from "./fau";

/** The sections of 13 in their order (design-spec 6.1・6.2). */
export const VALIDATION_SECTION_KEYS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06-08",
  "09",
  "10",
] as const;
export type ValidationSectionKey = (typeof VALIDATION_SECTION_KEYS)[number];

/**
 * The guide's upper end of check 1, "Competitors (3–5)". Fixed, not in the template, and
 * not used to judge (design-spec 6.1).
 */
export const COMPETITORS_GUIDE_MAX = 5;

/** The template's check thresholds (`template_check_rules.params`, design-spec 6.1). */
export interface CheckThresholds {
  competitors: { min: number };
  local_price: { pricedCompetitors: number; researchLogs: number };
  permits: { researchLogs: number };
  demand_signal: { researchLogs: number };
}

/**
 * One answer of the validation. `activeEvidenceCount` counts the evidence links whose
 * research log is not deleted; URL evidence always counts (design-spec 6.0.3).
 */
export interface ValidationAnswerInput {
  questionKey: string;
  text: string | null;
  fau: Fau | null;
  confidence: Confidence | null;
  activeEvidenceCount: number;
}

/** A cost row of 17 with its id and table order, for the links and order of Next steps. */
export interface CostRowState extends CostRowInput {
  id: UUID;
  sortOrder: number;
  confidence: Confidence | null;
  activeEvidenceCount: number;
}

/** One number of 18 as stored. A field without one was never entered. */
export interface EconomicsInputState {
  fieldKey: EconomicsField;
  value: number | null;
  fau: Fau | null;
  confidence: Confidence | null;
  activeEvidenceCount: number;
}

/**
 * One validation as read from the DB. Every list leaves out logically deleted rows
 * (SDD 6.5); answers may include keys the pinned template no longer has, which are not
 * counted.
 */
export interface ValidationState {
  /**
   * The sections of the pinned validation template version, in template order. Its
   * question sections are 01, 02, 04 (patterns), 08 (WORTH) and 10 (design-spec 6.6).
   */
  sections: readonly TemplateSection[];
  thresholds: CheckThresholds;
  answers: readonly ValidationAnswerInput[];
  researchLogs: readonly { supportsChecks: readonly SupportsCheck[] }[];
  competitors: readonly { typicalPrice: number | null }[];
  assumptionCount: number;
  riskCount: number;
  costRows: readonly CostRowState[];
  economicsInputs: readonly EconomicsInputState[];
}

/** Who is looking: links are built for this idea, and left out where the caller cannot go. */
export interface ViewContext {
  workspaceId: UUID;
  ideaId: UUID;
  /** Owner or Member of a live idea. False for a Viewer and for an archived idea. */
  canWrite: boolean;
}

/** One row of the sections of 13 (SDD 5.7 `ValidationHome.sections` without the title). */
export interface SectionProgress {
  key: ValidationSectionKey;
  /** Null for 03, 04 and 09, which show a count instead. */
  answered: number | null;
  total: number | null;
  count: number | null;
  /** 09 only: the risks, beside the assumptions in `count`. */
  countB?: number | null;
  fau: FauBreakdown | null;
}

/** One answer or number that takes F/A/U, located for Next steps. */
export interface FauItem {
  section: ValidationSectionKey;
  state: FauState;
  confidence: Confidence | null;
  /**
   * What "answered" counts (design-spec 6.1): has a value or is Unknown. Operating days
   * and the target margin are the exception: Unknown leaves them at the default, which
   * counts as not entered.
   */
  answered: boolean;
  link: LinkTarget;
}

/**
 * What `evaluateValidation` computes for one validation: the parts of SDD 5.7
 * `ValidationHome` that come from the calculation, and the economics behind them.
 */
export interface ValidationEvaluation {
  economics: EconomicsResult;
  keyMetrics: KeyMetrics;
  fau: FauBreakdown;
  sections: SectionProgress[];
  checks: CheckResult[];
  nextSteps: NextStep[];
}

const homeSectionOf = (
  templateSectionKey: string,
): ValidationSectionKey | null => {
  if (templateSectionKey === "08") return "06-08";
  return (VALIDATION_SECTION_KEYS as readonly string[]).includes(
    templateSectionKey,
  )
    ? (templateSectionKey as ValidationSectionKey)
    : null;
};

/** Where an item or section of 13 opens (design-spec 6.1 操作). */
const SECTION_SCREENS: Record<ValidationSectionKey, number> = {
  "01": 11,
  "02": 11,
  "03": 14,
  "04": 15,
  "05": 17,
  "06-08": 18,
  "09": 16,
  "10": 11,
};

/** What a display condition reads of an answer. */
type ShownAnswers = ReadonlyMap<string, Pick<ValidationAnswerInput, "text">>;

const answerText = (answers: ShownAnswers, key: string) =>
  answers.get(key)?.text?.trim() ?? null;

/**
 * Whether a question shows under the display condition of its template (02 OCEAN). A
 * hidden answer is kept but counted nowhere (design-spec 6.2).
 */
export const isQuestionShown = (
  question: Pick<TemplateQuestion, "displayCondition">,
  answers: ShownAnswers,
) => {
  if (question.displayCondition === null) return true;
  return Object.entries(question.displayCondition).every(([key, values]) => {
    const text = answerText(answers, key);
    return text !== null && values.includes(text);
  });
};

const questionItems = (
  state: ValidationState,
  answers: ReadonlyMap<string, ValidationAnswerInput>,
  ctx: ViewContext,
) => {
  const items: (FauItem & { hasFau: boolean })[] = [];
  for (const section of state.sections) {
    const home = homeSectionOf(section.key);
    if (home === null) continue;
    for (const question of section.questions) {
      if (!isQuestionShown(question, answers)) continue;
      const answer = answers.get(question.key);
      const hasValue = hasText(answer?.text ?? null);
      const fau = answer?.fau ?? null;
      items.push({
        section: home,
        hasFau: question.hasFau,
        state: fauState({
          hasValue,
          fau,
          confidence: answer?.confidence ?? null,
          activeEvidenceCount: answer?.activeEvidenceCount ?? 0,
        }),
        confidence: answer?.confidence ?? null,
        answered: hasValue || fau === "unknown",
        link: {
          screen: SECTION_SCREENS[home],
          workspaceId: ctx.workspaceId,
          ideaId: ctx.ideaId,
          ...(SECTION_SCREENS[home] === 11 ? { sectionKey: section.key } : {}),
          questionKey: question.key,
        },
      });
    }
  }
  return items;
};

const costRowItems = (state: ValidationState, ctx: ViewContext): FauItem[] =>
  costCategorySchema.options.flatMap((category) =>
    state.costRows
      .filter((row) => row.category === category)
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => {
        const hasValue = rowHasValue(row);
        return {
          section: "05" as const,
          state: fauState({ ...row, hasValue }),
          confidence: row.confidence,
          answered: hasValue || row.fau === "unknown",
          link: {
            screen: 17,
            workspaceId: ctx.workspaceId,
            ideaId: ctx.ideaId,
            rowId: row.id,
          },
        };
      }),
  );

const economicsItems = (
  inputs: ReadonlyMap<EconomicsField, EconomicsInputState>,
  ctx: ViewContext,
): FauItem[] =>
  economicsFieldSchema.options.map((field) => {
    const input = inputs.get(field);
    const hasValue = input?.value != null;
    const fau = input?.fau ?? null;
    return {
      section: "06-08" as const,
      state: fauState({
        hasValue,
        fau,
        confidence: input?.confidence ?? null,
        activeEvidenceCount: input?.activeEvidenceCount ?? 0,
      }),
      confidence: input?.confidence ?? null,
      // Operating days and the target margin left empty or Unknown are "still the
      // default", which counts as not entered (design-spec 6.1・6.4).
      answered:
        hasValue ||
        (fau === "unknown" &&
          field !== "operating_days" &&
          field !== "target_margin"),
      link: {
        screen: 18,
        workspaceId: ctx.workspaceId,
        ideaId: ctx.ideaId,
        field,
      },
    };
  });

const toEconomicsInput = (state: ValidationState): EconomicsInput => ({
  costRows: state.costRows,
  inputs: Object.fromEntries(
    state.economicsInputs.map((input) => [
      input.fieldKey,
      { value: input.value, fau: input.fau },
    ]),
  ),
});

const sectionLink = (
  key: ValidationSectionKey,
  ctx: ViewContext,
): LinkTarget => ({
  screen: SECTION_SCREENS[key],
  workspaceId: ctx.workspaceId,
  ideaId: ctx.ideaId,
  ...(SECTION_SCREENS[key] === 11 ? { sectionKey: key } : {}),
});

/**
 * Evaluates one validation for 13 and the screens that share its numbers: the economics,
 * key metrics, F/A/U breakdown, section progress, the six checks and Next steps
 * (design-spec 6.1・6.4).
 */
export const evaluateValidation = (
  state: ValidationState,
  ctx: ViewContext,
): ValidationEvaluation => {
  const answers = new Map(state.answers.map((a) => [a.questionKey, a]));
  const inputs = new Map(state.economicsInputs.map((i) => [i.fieldKey, i]));
  const economicsInput = toEconomicsInput(state);
  const economics = computeEconomics(economicsInput);

  const questions = questionItems(state, answers, ctx);
  const numbers = economicsItems(inputs, ctx);
  const costs = costRowItems(state, ctx);
  // The order within a section is kept, so the inputs of 18 come before V.08.WORTH, which
  // sits below them on the screen (design-spec 6.4).
  const fauItems = orderBySection([
    ...numbers,
    ...costs,
    ...questions.filter((item) => item.hasFau),
  ]);

  const sections = VALIDATION_SECTION_KEYS.map((key): SectionProgress => {
    const sectionFau = fauItems.filter((item) => item.section === key);
    switch (key) {
      case "03":
        return {
          key,
          answered: null,
          total: null,
          count: state.researchLogs.length,
          fau: null,
        };
      case "04":
        return {
          key,
          answered: null,
          total: null,
          count: state.competitors.length,
          fau: countFau(sectionFau),
        };
      case "09":
        return {
          key,
          answered: null,
          total: null,
          count: state.assumptionCount,
          countB: state.riskCount,
          fau: null,
        };
      // 05 counts its rows and 06–08 its seven inputs; V.08.WORTH is not one of them
      // but still counts in the F/A/U of 06–08 (design-spec 6.1).
      case "05":
      case "06-08": {
        const counted = key === "05" ? costs : numbers;
        return {
          key,
          answered: counted.filter((item) => item.answered).length,
          total: counted.length,
          count: null,
          fau: countFau(sectionFau),
        };
      }
      default: {
        const shown = questions.filter((item) => item.section === key);
        return {
          key,
          answered: shown.filter((item) => item.answered).length,
          total: shown.length,
          count: null,
          fau: countFau(sectionFau),
        };
      }
    }
  });

  const checks = evaluateChecks(state, economics, ctx);
  // A section is started by anything in it, including the answers its progress does not
  // count (V.04 patterns, V.08.WORTH): Next steps says it "has no answers yet".
  const startedSections = new Set<ValidationSectionKey>([
    ...sections.filter(isStarted).map((section) => section.key),
    ...questions.filter((item) => item.answered).map((item) => item.section),
  ]);
  return {
    economics,
    keyMetrics: buildKeyMetrics(economicsInput, economics),
    fau: countFau(fauItems),
    sections,
    checks,
    nextSteps: nextSteps({ fauItems, checks, startedSections }, ctx),
  };
};

const orderBySection = (items: FauItem[]) =>
  VALIDATION_SECTION_KEYS.flatMap((key) =>
    items.filter((item) => item.section === key),
  );

const isStarted = (section: SectionProgress) =>
  (section.answered ?? 0) > 0 ||
  (section.count ?? 0) > 0 ||
  (section.countB ?? 0) > 0;

const countTagged = (state: ValidationState, tag: SupportsCheck) =>
  state.researchLogs.filter((log) => log.supportsChecks.includes(tag)).length;

/** The six checks of design-spec 6.1, in their order. */
export const evaluateChecks = (
  state: ValidationState,
  economics: EconomicsResult,
  ctx: ViewContext,
): CheckResult[] => {
  const { thresholds } = state;
  const link = (screen: number, extra: Partial<LinkTarget> = {}) => ({
    screen,
    workspaceId: ctx.workspaceId,
    ideaId: ctx.ideaId,
    ...extra,
  });
  // A new research log entry on 14 is writing, so a Viewer gets no link (design-spec 6.1).
  const newEntry = (extra: Partial<LinkTarget> = {}) =>
    ctx.canWrite ? link(14, { newEntry: true, ...extra }) : null;
  const result = (
    key: CheckKey,
    checkState: CheckState,
    rest: Partial<Omit<CheckResult, "key" | "state">> & {
      link: LinkTarget | null;
    },
  ): CheckResult => ({
    key,
    state: checkState,
    count: null,
    params: {},
    detail: null,
    ...rest,
  });
  const atLeast = (count: number, threshold: number): CheckState =>
    count >= threshold ? "done" : "not_started";

  const competitors = state.competitors.length;
  const priced = state.competitors.filter(
    (c) => c.typicalPrice !== null,
  ).length;
  const localPriceLogs = countTagged(state, "local_price");
  const permitLogs = countTagged(state, "permits");
  const demandLogs = countTagged(state, "demand_signal");

  const { initial, monthlyFixed } = economics.totals;
  const costsMissing: CheckMissing[] = [];
  if (initial.amount === null) costsMissing.push("initial_amount");
  if (monthlyFixed.amount === null) costsMissing.push("monthly_amount");
  const emptyCostRows = initial.emptyRows + monthlyFixed.emptyRows;

  const hasPrice =
    state.economicsInputs.find((i) => i.fieldKey === "selling_price")?.value !=
    null;
  const hasMonthly = monthlyFixed.amount !== null;
  const breakEvenMissing: CheckMissing[] = [];
  if (!hasPrice) breakEvenMissing.push("price");
  if (!hasMonthly) breakEvenMissing.push("monthly_costs");

  const permitsRow = state.costRows.find(
    (row) => row.templateKey === "initial.permits",
  );
  const permitsRowDone =
    permitsRow !== undefined &&
    permitsRow.amount !== null &&
    (permitsRow.fau === "fact" || permitsRow.fau === "assumption");

  return [
    result(
      "competitors",
      competitors >= thresholds.competitors.min
        ? "done"
        : competitors > 0
          ? "partial"
          : "not_started",
      {
        count: competitors,
        params: {
          min: thresholds.competitors.min,
          max: COMPETITORS_GUIDE_MAX,
        },
        link: link(15),
      },
    ),
    result(
      "local_price",
      priced >= thresholds.local_price.pricedCompetitors ||
        localPriceLogs >= thresholds.local_price.researchLogs
        ? "done"
        : priced > 0 || localPriceLogs > 0
          ? "partial"
          : "not_started",
      { params: { ...thresholds.local_price }, link: link(15) },
    ),
    result(
      "costs",
      costsMissing.length === 0 && emptyCostRows === 0
        ? "done"
        : costsMissing.length < 2
          ? "partial"
          : "not_started",
      {
        detail: { emptyRows: emptyCostRows, missing: costsMissing },
        link: link(17),
      },
    ),
    result(
      "break_even",
      economics.breakEvenUnitsMonth.value !== null
        ? "done"
        : hasPrice || hasMonthly
          ? "partial"
          : "not_started",
      {
        detail: { missing: breakEvenMissing },
        // No price, or a margin of zero or less, is fixed on 18; only monthly costs on 17.
        link: link(hasPrice && !hasMonthly ? 17 : 18),
      },
    ),
    result(
      "permits",
      permitsRowDone
        ? "done"
        : atLeast(permitLogs, thresholds.permits.researchLogs),
      {
        params: { ...thresholds.permits },
        link: permitsRow
          ? link(17, { rowId: permitsRow.id })
          : newEntry({ presetSupports: ["permits"] }),
      },
    ),
    result(
      "demand_signal",
      atLeast(demandLogs, thresholds.demand_signal.researchLogs),
      {
        count: demandLogs,
        params: { ...thresholds.demand_signal },
        link: newEntry(),
      },
    ),
  ];
};

/** What `nextSteps` reads, as `evaluateValidation` prepares it. */
export interface NextStepInput {
  /** In the order of design-spec 6.1: 01 → 02 → 04 → 05 → 06–08 → 10. */
  fauItems: readonly FauItem[];
  checks: readonly CheckResult[];
  /** Sections with any input. None: nothing is filled in yet. */
  startedSections: ReadonlySet<ValidationSectionKey>;
}

/** At most three, in the priority of design-spec 6.1. */
export const NEXT_STEPS_MAX = 3;

/** Next steps of design-spec 6.1: what to fill next, never whether the idea is good. */
export const nextSteps = (
  input: NextStepInput,
  ctx: ViewContext,
): NextStep[] => {
  const steps: NextStep[] = [];
  const byState = (
    kind: NextStep["kind"],
    states: readonly FauState[],
  ): void => {
    const matching = input.fauItems.filter((item) =>
      states.includes(item.state),
    );
    const first = matching[0];
    if (first === undefined) return;
    steps.push({
      kind,
      count: matching.length,
      checkKey: null,
      sectionKey: first.section,
      link: first.link,
    });
  };

  byState("add_evidence", ["fact_no_evidence"]);
  byState("classify", ["unclassified"]);
  if (input.startedSections.size === 0)
    steps.push({
      kind: "start_customer_problem",
      count: null,
      checkKey: null,
      sectionKey: "01",
      link: sectionLink("01", ctx),
    });
  for (const check of input.checks) {
    if (check.state === "done") continue;
    steps.push({
      kind: "check",
      count:
        check.key === "costs"
          ? check.detail?.emptyRows || null
          : check.key === "competitors"
            ? (check.params.min ?? null)
            : null,
      checkKey: check.key,
      sectionKey: null,
      link: check.link,
    });
  }
  for (const key of VALIDATION_SECTION_KEYS) {
    if (input.startedSections.has(key)) continue;
    steps.push({
      kind: "start_section",
      count: null,
      checkKey: null,
      sectionKey: key,
      link: sectionLink(key, ctx),
    });
  }
  byState("check_unknowns", ["unknown"]);
  if (steps.length === 0)
    steps.push({
      kind: "ready_to_decide",
      count: null,
      checkKey: null,
      sectionKey: null,
      link: ctx.canWrite
        ? { screen: 19, workspaceId: ctx.workspaceId, ideaId: ctx.ideaId }
        : null,
    });
  return steps.slice(0, NEXT_STEPS_MAX);
};

/**
 * What a decision log entry keeps of the validation at the moment it is recorded (SDD 5.11
 * `DecisionLogEntry.snapshot`): the checks not done, the key metrics and the F/A/U
 * breakdown. A Go / No-Go adds its §24 conditions and plan version, a saved version its
 * plan version.
 */
export interface DecisionSnapshot {
  missingChecks: CheckResult[];
  keyMetrics: KeyMetrics;
  fau: FauBreakdown;
  conditions?: {
    launchIf: string | null;
    delayIf: string | null;
    stopIf: string | null;
  };
  planVersion?: { id: UUID; name: string } | null;
}

/**
 * The snapshot of a decision log entry from the evaluation at the moment it is recorded.
 * A Go / No-Go passes its conditions and plan version in `plan`, a saved version its plan
 * version.
 */
export const buildDecisionSnapshot = (
  evaluation: ValidationEvaluation,
  plan: Pick<DecisionSnapshot, "conditions" | "planVersion"> = {},
): DecisionSnapshot => ({
  missingChecks: evaluation.checks.filter((check) => check.state !== "done"),
  keyMetrics: evaluation.keyMetrics,
  fau: evaluation.fau,
  ...plan,
});
