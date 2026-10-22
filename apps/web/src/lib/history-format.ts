import { fauState, hasText } from "@moonx/domain";
import {
  formatDate,
  formatInputNumber,
  formatInputPercent,
  formatList,
  formatMoney,
  i18n,
} from "@moonx/i18n";
import type {
  CanReduce,
  CompetitorType,
  Confidence,
  EconomicsField,
  Fau,
  FauState,
  HistoryEntry,
  HistorySource,
  SourceType,
  SupportsCheck,
} from "@moonx/schemas";

/**
 * One field a change touched, as PNL-2 shows it (design-spec 6.0.5): its name, and its
 * value before and after in words. An empty side is "" (nothing was there, or nothing is
 * left).
 */
export interface FieldChange {
  /** The field's name; null for an answer's text, which is the item itself. */
  label: string | null;
  before: string;
  after: string;
}

/** What the words of a change depend on besides the change itself. */
export interface ChangeContext {
  /** The workspace's currency (ISO 4217), for amounts. */
  currency: string;
  /** The user's time zone, for a research log entry's date. */
  timeZone: string;
  /**
   * Whether the question `questionKey` has F/A/U (the template's `hasFau`, design-spec
   * 6.0.3): an answer without it shows no F/A/U and takes no evidence.
   */
  hasFau: (questionKey: string) => boolean;
  /** F/A/U in words, as the screens put it ("Fact · 2 sources"). 4.5 FauPicker. */
  fauLabel: (
    state: FauState,
    options: { confidence: Confidence | null; evidenceCount: number },
  ) => string;
}

type Content = Record<string, unknown> | null;

const asContent = (value: unknown): Content =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const number = (value: unknown) => (typeof value === "number" ? value : null);
const ids = (value: unknown) => (Array.isArray(value) ? value.length : 0);

/** A field of one kind of item: its name and its value in words ("" when it has none). */
interface FieldSpec {
  label: string | null;
  words: (content: Record<string, unknown>) => string;
  /**
   * Whether the field holds only what an item starts with (no evidence, not a lump sum,
   * entered as an amount, Empty): an added or deleted item does not list it.
   */
  isUnset?: (content: Record<string, unknown>) => boolean;
}

/** The F/A/U of an item, from what the history keeps of it (history-values.ts). */
const fauField = (
  context: ChangeContext,
  hasValue: (content: Record<string, unknown>) => boolean,
): FieldSpec => {
  const stateOf = (content: Record<string, unknown>) =>
    fauState({
      hasValue: hasValue(content),
      fau: (content.fau ?? null) as Fau | null,
      confidence: (content.confidence ?? null) as Confidence | null,
      // The links the change kept: a research log deleted since still counts, as it did.
      activeEvidenceCount: ids(content.evidenceIds),
    });
  return {
    label: i18n.t("validation:costs.column.fau"),
    words: (content) =>
      context.fauLabel(stateOf(content), {
        confidence: (content.confidence ?? null) as Confidence | null,
        evidenceCount: ids(content.evidenceIds),
      }),
    isUnset: (content) => stateOf(content) === "empty",
  };
};

/** The evidence of a row without F/A/U (15's cards, 16's assumptions): how many. */
const evidenceField = (): FieldSpec => ({
  label: i18n.t("validation:rows.evidence"),
  words: (content) => {
    const count = ids(content.evidenceIds);
    return count === 0
      ? i18n.t("validation:rows.noSources")
      : i18n.t("validation:rows.sources", { count });
  },
  isUnset: (content) => ids(content.evidenceIds) === 0,
});

const textField = (label: string, key: string): FieldSpec => ({
  label,
  words: (content) => text(content[key]),
});

const choiceField = (
  label: string,
  key: string,
  words: (value: string) => string,
  isUnset?: (content: Record<string, unknown>) => boolean,
): FieldSpec => ({
  label,
  words: (content) => {
    const value = content[key];
    return typeof value === "string" ? words(value) : "";
  },
  isUnset,
});

const level = (value: string) =>
  i18n.t(`common:confidence.${value as Confidence}`);

/** An economics number as 18 shows it: the price in money, the margin as a %. */
function economicsValue(
  field: EconomicsField,
  value: number | null,
  currency: string,
): string {
  if (value === null) return "";
  if (field === "selling_price") {
    return formatMoney(value, currency, { cents: !Number.isInteger(value) });
  }
  if (field === "target_margin") return formatInputPercent(value);
  return formatInputNumber(value);
}

function fieldsOf(
  entry: HistoryEntry,
  context: ChangeContext,
): readonly FieldSpec[] {
  const type = entry.target.type;
  switch (type) {
    case "validation_answer":
      return [
        { label: null, words: (content) => text(content.text) },
        ...(context.hasFau(entry.target.key ?? "")
          ? [
              fauField(context, (content) => hasText(text(content.text))),
              evidenceField(),
            ]
          : []),
      ];
    case "economics_input": {
      const field = entry.target.key as EconomicsField;
      return [
        {
          label: i18n.t("validation:economics.column.value"),
          words: (content) =>
            economicsValue(field, number(content.value), context.currency),
        },
        fauField(context, (content) => number(content.value) !== null),
        evidenceField(),
      ];
    }
    case "idea":
      return [
        textField(i18n.t("ideas:form.name"), "name"),
        textField(i18n.t("ideas:form.concept"), "oneLineConcept"),
        textField(i18n.t("ideas:form.solution"), "proposedSolution"),
      ];
    case "research_log_entry":
      return [
        {
          label: i18n.t("validation:research.field.date"),
          words: (content) =>
            typeof content.observedOn === "string"
              ? formatDate(content.observedOn, { timeZone: context.timeZone })
              : "",
        },
        textField(i18n.t("validation:research.field.topic"), "topic"),
        textField(
          i18n.t("validation:research.field.observation"),
          "observation",
        ),
        choiceField(
          i18n.t("validation:research.field.sourceType"),
          "sourceType",
          (value) => i18n.t(`common:sourceType.${value as SourceType}`),
        ),
        textField(i18n.t("validation:research.field.sourceUrl"), "sourceUrl"),
        {
          label: i18n.t("validation:research.field.supports"),
          words: (content) =>
            Array.isArray(content.supportsChecks)
              ? formatList(
                  content.supportsChecks.map((check) =>
                    i18n.t(`common:supportsCheck.${check as SupportsCheck}`),
                  ),
                )
              : "",
        },
        textField(
          i18n.t("validation:research.field.supportsNote"),
          "supportsNote",
        ),
      ];
    case "competitor":
      return [
        textField(i18n.t("validation:competitors.field.name"), "name"),
        choiceField(
          i18n.t("validation:competitors.field.type"),
          "type",
          (value) => i18n.t(`common:competitorType.${value as CompetitorType}`),
        ),
        textField(
          i18n.t("validation:competitors.field.targetCustomer"),
          "targetCustomer",
        ),
        textField(i18n.t("validation:competitors.field.offering"), "offering"),
        {
          label: i18n.t("validation:competitors.field.typicalPrice"),
          words: (content) => {
            const price = number(content.typicalPrice);
            return price === null
              ? ""
              : formatMoney(price, context.currency, {
                  cents: !Number.isInteger(price),
                });
          },
        },
        textField(
          i18n.t("validation:competitors.field.priceNote"),
          "priceNote",
        ),
        textField(i18n.t("validation:competitors.field.strength"), "strength"),
        textField(i18n.t("validation:competitors.field.weakness"), "weakness"),
        textField(
          i18n.t("validation:competitors.field.whyChosen"),
          "whyChosen",
        ),
        textField(
          i18n.t("validation:competitors.field.whySurvive"),
          "whySurvive",
        ),
        evidenceField(),
      ];
    case "assumption":
      return [
        textField(
          i18n.t("validation:assumptions.field.statement.assumptions"),
          "statement",
        ),
        textField(
          i18n.t("validation:assumptions.field.whyBelieve"),
          "whyBelieve",
        ),
        textField(
          i18n.t("validation:assumptions.field.evidenceNote"),
          "evidenceNote",
        ),
        choiceField(
          i18n.t("validation:assumptions.field.confidence"),
          "confidence",
          level,
        ),
        textField(
          i18n.t("validation:assumptions.field.disproveCondition"),
          "disproveCondition",
        ),
        textField(
          i18n.t("validation:assumptions.field.nextCheck"),
          "nextCheck",
        ),
        evidenceField(),
      ];
    case "risk":
      return [
        textField(
          i18n.t("validation:assumptions.field.statement.risks"),
          "statement",
        ),
        choiceField(
          i18n.t("validation:assumptions.field.probability"),
          "probability",
          level,
        ),
        choiceField(
          i18n.t("validation:assumptions.field.impact"),
          "impact",
          level,
        ),
        textField(
          i18n.t("validation:assumptions.field.whyMatters"),
          "whyMatters",
        ),
        textField(
          i18n.t("validation:assumptions.field.mitigation"),
          "mitigation",
        ),
        textField(
          i18n.t("validation:assumptions.field.howToValidate"),
          "howToValidate",
        ),
      ];
    case "cost_item": {
      const money = (content: Record<string, unknown>, key: string) => {
        const amount = number(content[key]);
        return amount === null
          ? ""
          : formatMoney(amount, context.currency, {
              cents:
                content.category === "variable" || !Number.isInteger(amount),
            });
      };
      return [
        textField(i18n.t("validation:costs.field.name"), "name"),
        choiceField(
          i18n.t("panels:history.field.inputMode"),
          "inputMode",
          (mode) =>
            mode === "percent_of_price"
              ? i18n.t("validation:costs.field.percent")
              : i18n.t("validation:costs.field.amount"),
          (content) => content.inputMode !== "percent_of_price",
        ),
        {
          label: i18n.t("validation:costs.field.amount"),
          words: (content) => money(content, "amount"),
        },
        {
          label: i18n.t("validation:costs.field.percent"),
          words: (content) => {
            const percent = number(content.percent);
            return percent === null ? "" : formatInputPercent(percent);
          },
        },
        {
          label: i18n.t("validation:costs.lumpSum"),
          words: (content) =>
            content.isLumpSum === true
              ? i18n.t("panels:history.yes")
              : i18n.t("panels:history.no"),
          isUnset: (content) => content.isLumpSum !== true,
        },
        textField(i18n.t("validation:costs.field.whyNeeded"), "whyNeeded"),
        choiceField(
          i18n.t("validation:costs.field.canReduce"),
          "canReduce",
          (value) => i18n.t(`validation:costs.canReduce.${value as CanReduce}`),
        ),
        textField(i18n.t("validation:costs.field.notes"), "notes"),
        fauField(
          context,
          (content) =>
            number(content.amount) !== null || number(content.percent) !== null,
        ),
        evidenceField(),
      ];
    }
    default:
      // Only the screens of 11 and 13–18 open PNL-2, and their history holds these kinds
      // (SDD 6.3「画面と節の対応」). Self-analysis answers come with 10 and 11 (Step 33);
      // the plan's header, answers and execution items with 20 and 21 (Step 34).
      throw new Error(`No history words for ${type}`);
  }
}

/**
 * Whether `entry` is the row an undone creation left under the idea it came from (SDD
 * 5.11「作成の取り消し」): "Duplicate undone" or "Plan draft undone", which nothing reverts.
 */
export const isUndoneCreation = (entry: HistoryEntry) =>
  entry.source === "revert" &&
  entry.action === "delete" &&
  entry.batchId === null &&
  (entry.target.type === "idea" || entry.target.type === "business_plan");

/** Whether `entry` is of a creation that "Undo the whole operation" deletes (6.0.5). */
export const isCreation = (entry: HistoryEntry) =>
  entry.batchId !== null &&
  (entry.source === "duplicate" || entry.source === "plan_draft");

/**
 * The fields `entry` changed, before and after, in the order the item's form has them:
 * the fields an added or deleted item had set, the fields whose words differ for a
 * change. Evidence attached or detached shows in F/A/U where F/A/U counts it (a Fact),
 * and as its own count where it does not. None for a template's version or an undone
 * creation, which say what they did in their title ({@link changeTitle}).
 */
export function fieldChanges(
  entry: HistoryEntry,
  context: ChangeContext,
): FieldChange[] {
  if (entry.target.type === "template_version" || isUndoneCreation(entry)) {
    return [];
  }
  const before = asContent(entry.before);
  const after = asContent(entry.after);
  const wordsOf = (field: FieldSpec, content: Content) =>
    content === null ||
    ((before === null || after === null) && field.isUnset?.(content) === true)
      ? ""
      : field.words(content);
  const changes = fieldsOf(entry, context).flatMap((field) => {
    const was = wordsOf(field, before);
    const is = wordsOf(field, after);
    return was === is ? [] : [{ label: field.label, before: was, after: is }];
  });
  // F/A/U words the count of a Fact's sources, and of none: "Assumption · Low" reads
  // the same with a source or without.
  const countInFau = (content: Content) =>
    content === null ||
    ids(content.evidenceIds) === 0 ||
    content.fau === "fact";
  const fau = i18n.t("validation:costs.column.fau");
  const evidence = i18n.t("validation:rows.evidence");
  return changes.some(({ label }) => label === fau) &&
    countInFau(before) &&
    countInFau(after)
    ? changes.filter(({ label }) => label !== evidence)
    : changes;
}

const versionOf = (value: unknown) => number(asContent(value)?.versionNumber);

/**
 * What a row says it did in place of a diff: "Template updated to v2" when the version
 * moved on (a migration, or undoing its undo), "Template set back to v1" when it moved
 * back (design-spec 6.0.7); null for every other row.
 */
export function changeTitle(entry: HistoryEntry): string | null {
  if (entry.target.type !== "template_version") return null;
  const version = versionOf(entry.after);
  if (version === null) return null;
  const from = versionOf(entry.before);
  return from !== null && version < from
    ? i18n.t("panels:history.templateBack", { version })
    : i18n.t("panels:history.templateUpdated", { version });
}

/**
 * The kind of change and of operation beside each other (design-spec 6.0.5): "Manual ·
 * Changed", "AI import · Added"; an undone creation names what it undid ("Duplicate
 * undone · Deleted").
 */
export function changeKind(entry: HistoryEntry): string {
  const source: string = isUndoneCreation(entry)
    ? i18n.t(
        entry.target.type === "idea"
          ? "panels:history.source.duplicateUndone"
          : "panels:history.source.planDraftUndone",
      )
    : i18n.t(`panels:history.source.${entry.source satisfies HistorySource}`);
  return [source, i18n.t(`panels:history.action.${entry.action}`)].join(
    i18n.t("app:separator"),
  );
}
