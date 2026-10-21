import {
  dateInputSchema,
  longTextSchema,
  type ResearchLogEntry,
  type ResearchLogInput,
  requiredShortTextSchema,
  type SourceType,
  type SupportsCheck,
  sourceTypeSchema,
  supportsCheckSchema,
  urlSchema,
} from "@moonx/schemas";
import {
  Checkbox,
  CheckboxGroup,
  DatePicker,
  Picker,
  Stack,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { inputIssueMessage } from "../lib/input-issues";

/** A research log entry as its fields hold it (design-spec 6.10・6.0.8). */
export interface ResearchLogValues {
  observedOn: string | null;
  topic: string;
  observation: string;
  sourceType: SourceType | null;
  sourceUrl: string;
  supportsChecks: SupportsCheck[];
  supportsNote: string;
}

/** One field of a research log entry, by its name in `ResearchLogInput`. */
export type ResearchLogField = keyof ResearchLogValues;

/** The fields as an entry fills them: blank for what it does not hold. */
export const valuesOf = (entry: ResearchLogEntry): ResearchLogValues => ({
  observedOn: entry.observedOn,
  topic: entry.topic,
  observation: entry.observation ?? "",
  sourceType: entry.sourceType,
  sourceUrl: entry.sourceUrl ?? "",
  supportsChecks: [...entry.supportsChecks],
  supportsNote: entry.supportsNote ?? "",
});

/** A new entry's fields: the date starts as today in the user's zone (6.10). */
export const newValues = (
  today: string,
  supportsChecks: readonly SupportsCheck[] = [],
): ResearchLogValues => ({
  observedOn: today,
  topic: "",
  observation: "",
  sourceType: null,
  sourceUrl: "",
  supportsChecks: [...supportsChecks],
  supportsNote: "",
});

/** Why `value` breaks the rule of `field` (design-spec 6.0.8), or undefined. */
export function researchFieldError(
  field: ResearchLogField,
  value: ResearchLogValues[ResearchLogField],
): string | undefined {
  const result = (() => {
    switch (field) {
      case "observedOn":
        return dateInputSchema.nullable().safeParse(value);
      case "topic":
        return requiredShortTextSchema.safeParse(value);
      case "observation":
      case "supportsNote":
        return longTextSchema.safeParse(value);
      case "sourceType":
        return sourceTypeSchema.nullable().safeParse(value);
      case "sourceUrl":
        // Blank is no URL; anything else is checked as one.
        return typeof value === "string" && value.trim() === ""
          ? { success: true as const }
          : urlSchema.safeParse(value);
      case "supportsChecks":
        return supportsCheckSchema.array().safeParse(value);
    }
  })();
  const [issue] = result.success ? [] : result.error.issues;
  return issue === undefined ? undefined : inputIssueMessage(issue);
}

/** Whether every field keeps its rule: what a new entry needs before it can be added. */
export const isValid = (values: ResearchLogValues) =>
  (Object.keys(values) as ResearchLogField[]).every(
    (field) => researchFieldError(field, values[field]) === undefined,
  );

/**
 * One field's value as V6 POST, V7 PATCH and V4's `newResearchLog` take it: a blank URL is
 * none (the API checks any text as a URL), the texts as typed (the API saves blank as
 * none).
 */
export function wireValue(
  field: ResearchLogField,
  value: ResearchLogValues[ResearchLogField],
): unknown {
  if (field === "sourceUrl" && typeof value === "string") {
    return value.trim() === "" ? null : value;
  }
  return value;
}

/** A new entry's fields as `ResearchLogInput`. */
export const inputOf = (values: ResearchLogValues): ResearchLogInput =>
  Object.fromEntries(
    (Object.keys(values) as ResearchLogField[]).map((field) => [
      field,
      wireValue(field, values[field]),
    ]),
  ) as ResearchLogInput;

/** The Source Type picker's item for none: an entry need not name one (6.0.8). */
const NO_SOURCE = "none";

/**
 * The fields of a research log entry (design-spec 6.10, 14 and M2's "New entry"): Date
 * (today to start with; cleared for none), Topic (required), Observation, Source Type,
 * Source URL, Supports check and What It Supports. Each says under it why its value breaks
 * its rule (6.0.8); the screen decides what is sent.
 */
export function ResearchLogFields({
  values,
  errors = {},
  onChange,
  onBlur,
  isReadOnly = false,
  autoFocus = false,
}: {
  values: ResearchLogValues;
  errors?: Partial<Record<ResearchLogField, string>>;
  onChange: <F extends ResearchLogField>(
    field: F,
    value: ResearchLogValues[F],
  ) => void;
  /** A text field was left (6.0.2: what waits is saved). */
  onBlur?: (field: ResearchLogField) => void;
  isReadOnly?: boolean;
  /** Topic takes focus on opening (a new entry). */
  autoFocus?: boolean;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const textProps = (field: "topic" | "observation" | "supportsNote") => ({
    value: values[field],
    onChange: (value: string) => onChange(field, value),
    onBlur: () => onBlur?.(field),
    errorMessage: errors[field],
    isReadOnly,
    width: "full" as const,
  });
  return (
    <Stack gap="space-300">
      <DatePicker
        label={t("validation:research.field.date")}
        value={values.observedOn}
        onChange={(value) => onChange("observedOn", value)}
        errorMessage={errors.observedOn}
        isReadOnly={isReadOnly}
      />
      <TextField
        {...textProps("topic")}
        label={t("validation:research.field.topic")}
        isRequired
        autoFocus={autoFocus}
      />
      <TextArea
        {...textProps("observation")}
        label={t("validation:research.field.observation")}
      />
      <Picker
        label={t("validation:research.field.sourceType")}
        items={[
          { id: NO_SOURCE, label: t("validation:research.field.noSource") },
          ...sourceTypeSchema.options.map((id) => ({
            id,
            label: t(`common:sourceType.${id}`),
          })),
        ]}
        value={values.sourceType ?? NO_SOURCE}
        onChange={(value) =>
          onChange(
            "sourceType",
            value === null || value === NO_SOURCE
              ? null
              : sourceTypeSchema.parse(value),
          )
        }
        errorMessage={errors.sourceType}
        isDisabled={isReadOnly}
        width="full"
      />
      <TextField
        label={t("validation:research.field.sourceUrl")}
        type="url"
        inputMode="url"
        value={values.sourceUrl}
        onChange={(value) => onChange("sourceUrl", value)}
        onBlur={() => onBlur?.("sourceUrl")}
        errorMessage={errors.sourceUrl}
        isReadOnly={isReadOnly}
        width="full"
      />
      <CheckboxGroup
        label={t("validation:research.field.supports")}
        value={values.supportsChecks}
        onChange={(value) =>
          onChange(
            "supportsChecks",
            supportsCheckSchema.options.filter((check) =>
              value.includes(check),
            ),
          )
        }
        errorMessage={errors.supportsChecks}
        isReadOnly={isReadOnly}
      >
        {supportsCheckSchema.options.map((check) => (
          <Checkbox key={check} value={check}>
            {t(`common:supportsCheck.${check}`)}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <TextArea
        {...textProps("supportsNote")}
        label={t("validation:research.field.supportsNote")}
      />
    </Stack>
  );
}
