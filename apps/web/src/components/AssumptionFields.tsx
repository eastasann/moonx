import {
  type Assumption,
  type Confidence,
  confidenceSchema,
  longTextSchema,
  type Risk,
  requiredLongTextSchema,
} from "@moonx/schemas";
import {
  Button,
  Flex,
  Picker,
  SegmentedControl,
  SegmentedControlItem,
  Stack,
  Text,
  TextArea,
} from "@moonx/ui-web";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { inputIssueMessage } from "../lib/input-issues";
import type { RowFieldsSpec } from "./RowFields";

/** An assumption as its fields hold it (design-spec 6.10・6.0.8). */
export interface AssumptionValues {
  statement: string;
  whyBelieve: string;
  evidenceNote: string;
  confidence: Confidence | null;
  disproveCondition: string;
  nextCheck: string;
}

/** A risk as its fields hold it (design-spec 6.10・6.0.8). */
export interface RiskValues {
  statement: string;
  probability: Confidence | null;
  impact: Confidence | null;
  whyMatters: string;
  mitigation: string;
  howToValidate: string;
}

export const assumptionValues = (row: Assumption): AssumptionValues => ({
  statement: row.statement,
  whyBelieve: row.whyBelieve ?? "",
  evidenceNote: row.evidenceNote ?? "",
  confidence: row.confidence,
  disproveCondition: row.disproveCondition ?? "",
  nextCheck: row.nextCheck ?? "",
});

export const riskValues = (row: Risk): RiskValues => ({
  statement: row.statement,
  probability: row.probability,
  impact: row.impact,
  whyMatters: row.whyMatters ?? "",
  mitigation: row.mitigation ?? "",
  howToValidate: row.howToValidate ?? "",
});

export const newAssumptionValues = (): AssumptionValues => ({
  statement: "",
  whyBelieve: "",
  evidenceNote: "",
  confidence: null,
  disproveCondition: "",
  nextCheck: "",
});

export const newRiskValues = (): RiskValues => ({
  statement: "",
  probability: null,
  impact: null,
  whyMatters: "",
  mitigation: "",
  howToValidate: "",
});

/** The levels of Confidence, Probability and Impact (6.0.8). */
const LEVELS = new Set(["confidence", "probability", "impact"]);

/**
 * The rules of 16's fields (6.0.8) and how they travel (SDD 5.7 V10・V11): the statement
 * is required, the levels are Low / Medium / High or none, the rest long texts sent as
 * typed (the API saves blank as none).
 */
function rowSpec<V extends object>(): RowFieldsSpec<V> {
  return {
    errorOf: (field, value) => {
      const result =
        field === "statement"
          ? requiredLongTextSchema.safeParse(value)
          : LEVELS.has(field as string)
            ? confidenceSchema.nullable().safeParse(value)
            : longTextSchema.safeParse(value);
      const [issue] = result.success ? [] : result.error.issues;
      return issue === undefined ? undefined : inputIssueMessage(issue);
    },
    toWire: (_field, value) => value,
    fromWire: (field, value) =>
      (LEVELS.has(field as string) ? (value ?? null) : (value ?? "")) as never,
    isChoice: (field) => LEVELS.has(field as string),
  };
}

export const assumptionSpec = rowSpec<AssumptionValues>();
export const riskSpec = rowSpec<RiskValues>();

interface FieldsProps<V extends object> {
  values: V;
  errors?: Partial<Record<keyof V, string>>;
  onChange: <F extends keyof V>(field: F, value: V[F]) => void;
  /** A text field was left (6.0.2: what waits is saved). */
  onBlur?: (field: keyof V) => void;
  isReadOnly?: boolean;
  /** The statement takes focus on opening (a new row). */
  autoFocus?: boolean;
}

/** The Picker's item for a level not set: Probability and Impact may be left empty. */
const NOT_SET = "none";

/**
 * An assumption's fields (design-spec 6.10): Assumption (required), Why We Believe It,
 * Evidence (the attached evidence in `evidence`, then its note), Confidence, What Would
 * Disprove It and Next Check. Confidence is a SegmentedControl (4.5), with Clear to leave
 * it unset again.
 */
export function AssumptionFields({
  values,
  errors = {},
  onChange,
  onBlur,
  isReadOnly = false,
  autoFocus = false,
  evidence,
}: FieldsProps<AssumptionValues> & { evidence?: ReactNode }) {
  const { t } = useTranslation(["validation", "common"]);
  const confidenceLabel = useId();
  const confidenceControl = useId();
  const confidenceError = useId();
  const clearConfidence = () => {
    onChange("confidence", null);
    // Clear goes with the value it clears: focus moves to the choices.
    requestAnimationFrame(() =>
      document
        .getElementById(confidenceControl)
        ?.querySelector<HTMLElement>("button")
        ?.focus(),
    );
  };
  const textProps = (field: Exclude<keyof AssumptionValues, "confidence">) => ({
    value: values[field],
    onChange: (value: string) => onChange(field, value),
    onBlur: () => onBlur?.(field),
    errorMessage: errors[field],
    isReadOnly,
    width: "full" as const,
  });
  return (
    <Stack gap="space-300">
      <TextArea
        {...textProps("statement")}
        label={t("validation:assumptions.field.statement.assumptions")}
        isRequired
        autoFocus={autoFocus}
      />
      <TextArea
        {...textProps("whyBelieve")}
        label={t("validation:assumptions.field.whyBelieve")}
      />
      {evidence}
      <TextArea
        {...textProps("evidenceNote")}
        label={t("validation:assumptions.field.evidenceNote")}
      />
      <Stack gap="space-100">
        <Text variant="label" id={confidenceLabel}>
          {t("validation:assumptions.field.confidence")}
        </Text>
        <Flex gap="space-200" alignItems="center" wrap>
          <SegmentedControl
            id={confidenceControl}
            aria-labelledby={confidenceLabel}
            aria-describedby={
              errors.confidence === undefined ? undefined : confidenceError
            }
            selectedKey={values.confidence}
            onSelectionChange={(key) =>
              onChange("confidence", confidenceSchema.parse(key))
            }
            isDisabled={isReadOnly}
          >
            {confidenceSchema.options.map((level) => (
              <SegmentedControlItem key={level} id={level}>
                {t(`common:confidence.${level}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          {values.confidence !== null && (
            <Button
              variant="secondary"
              isQuiet
              size="S"
              onPress={clearConfidence}
              isDisabled={isReadOnly}
            >
              {t("validation:assumptions.clearConfidence")}
            </Button>
          )}
        </Flex>
        {errors.confidence !== undefined && (
          <Text variant="caption" tone="negative" id={confidenceError}>
            {errors.confidence}
          </Text>
        )}
      </Stack>
      <TextArea
        {...textProps("disproveCondition")}
        label={t("validation:assumptions.field.disproveCondition")}
      />
      <TextArea
        {...textProps("nextCheck")}
        label={t("validation:assumptions.field.nextCheck")}
      />
    </Stack>
  );
}

/**
 * A risk's fields (design-spec 6.10): Risk (required), Probability and Impact (Pickers
 * with Not set first, 4.5), Why It Matters, Mitigation and How to Validate.
 */
export function RiskFields({
  values,
  errors = {},
  onChange,
  onBlur,
  isReadOnly = false,
  autoFocus = false,
}: FieldsProps<RiskValues>) {
  const { t } = useTranslation(["validation", "common"]);
  const textProps = (
    field: Exclude<keyof RiskValues, "probability" | "impact">,
  ) => ({
    value: values[field],
    onChange: (value: string) => onChange(field, value),
    onBlur: () => onBlur?.(field),
    errorMessage: errors[field],
    isReadOnly,
    width: "full" as const,
  });
  const level = (field: "probability" | "impact") => (
    <Picker
      label={t(`validation:assumptions.field.${field}`)}
      items={[
        { id: NOT_SET, label: t("validation:assumptions.field.notSet") },
        ...confidenceSchema.options.map((id) => ({
          id,
          label: t(`common:confidence.${id}`),
        })),
      ]}
      value={values[field] ?? NOT_SET}
      onChange={(value) =>
        onChange(
          field,
          value === null || value === NOT_SET
            ? null
            : confidenceSchema.parse(value),
        )
      }
      errorMessage={errors[field]}
      isDisabled={isReadOnly}
    />
  );
  return (
    <Stack gap="space-300">
      <TextArea
        {...textProps("statement")}
        label={t("validation:assumptions.field.statement.risks")}
        isRequired
        autoFocus={autoFocus}
      />
      <Flex gap="space-300" wrap alignItems="start">
        {level("probability")}
        {level("impact")}
      </Flex>
      <TextArea
        {...textProps("whyMatters")}
        label={t("validation:assumptions.field.whyMatters")}
      />
      <TextArea
        {...textProps("mitigation")}
        label={t("validation:assumptions.field.mitigation")}
      />
      <TextArea
        {...textProps("howToValidate")}
        label={t("validation:assumptions.field.howToValidate")}
      />
    </Stack>
  );
}
