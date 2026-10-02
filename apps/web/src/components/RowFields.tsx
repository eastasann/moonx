import { parseDate } from "@internationalized/date";
import { formatDate, formatMoney, moneyInputFormat } from "@moonx/i18n";
import { MAX_LONG_TEXT } from "@moonx/schemas";
import {
  Checkbox,
  CheckboxGroup,
  DatePicker,
  NumberField,
  Picker,
  PickerItem,
  SegmentedControl,
  SegmentedControlItem,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { readNumberText } from "../lib/number-input";
import {
  type Draft,
  type FieldProblem,
  type FieldSpec,
  type FieldValue,
  MAX_ROW_NAME,
  MAX_URL,
} from "../lib/row-fields";

const NONE = "__none";

export interface RowFieldsProps {
  specs: readonly FieldSpec[];
  values: Draft;
  /** `immediate` is for a choice or a date, which save when picked. */
  onChange: (key: string, value: FieldValue, options?: { immediate?: boolean }) => void;
  /** Sends what is waiting (the person left a field). */
  onBlur?: () => void;
  problems?: Partial<Record<string, FieldProblem>>;
  /** A Viewer, or an idea that is archived: the fields are text. */
  isReadOnly: boolean;
  currency: string;
  timeZone: string;
  /** Changes when the values are replaced as a whole, so number fields start over from them. */
  revision?: number;
  /** The key of the field that takes the cursor when the form appears. */
  autoFocusKey?: string;
}

/**
 * The fields of one row of 14, 15 or 16 (design-spec 6.10), as inputs for an editor and as plain
 * text for a Viewer. Which fields there are, and their kinds, come from the specs.
 */
export function RowFields({
  specs,
  values,
  onChange,
  onBlur,
  problems = {},
  isReadOnly,
  currency,
  timeZone,
  revision = 0,
  autoFocusKey,
}: RowFieldsProps) {
  const { t } = useTranslation(["research", "form", "app"]);
  const problemText = (problem: FieldProblem | undefined) => {
    switch (problem) {
      case "required":
        return t("app:form.required");
      case "url":
        return t("research:problems.url");
      case "range":
        return t("research:problems.range");
      default:
        return undefined;
    }
  };

  return (
    <Stack gap="space-200">
      {specs.map((spec) => {
        const value = values[spec.key] ?? null;
        if (isReadOnly) {
          return (
            <ReadOnlyField
              key={spec.key}
              spec={spec}
              value={value}
              currency={currency}
              timeZone={timeZone}
            />
          );
        }
        const problem = problemText(problems[spec.key]);
        switch (spec.kind) {
          case "text":
            return (
              <TextField
                key={spec.key}
                label={spec.label}
                isRequired={spec.required}
                autoFocus={autoFocusKey === spec.key}
                value={String(value ?? "")}
                maxLength={MAX_ROW_NAME}
                isInvalid={problem !== undefined}
                errorMessage={problem}
                onChange={(next) => onChange(spec.key, next)}
                onBlur={onBlur}
              />
            );
          case "longText":
            return (
              <TextArea
                key={spec.key}
                label={spec.label}
                value={String(value ?? "")}
                maxLength={MAX_LONG_TEXT}
                onChange={(next) => onChange(spec.key, next)}
                onBlur={onBlur}
              />
            );
          case "url":
            return (
              <TextField
                key={spec.key}
                label={spec.label}
                inputMode="url"
                value={String(value ?? "")}
                maxLength={MAX_URL}
                isInvalid={problem !== undefined}
                errorMessage={problem}
                onChange={(next) => onChange(spec.key, next)}
                onBlur={onBlur}
              />
            );
          case "date":
            return (
              <DatePicker
                key={spec.key}
                label={spec.label}
                openLabel={t("form:evidence.log.openCalendar")}
                previousMonthLabel={t("form:evidence.log.previousMonth")}
                nextMonthLabel={t("form:evidence.log.nextMonth")}
                value={value ? parseDate(String(value)) : null}
                onChange={(next) =>
                  onChange(spec.key, next ? next.toString() : "", { immediate: true })
                }
              />
            );
          case "money":
            return (
              <NumberField
                key={`${spec.key}:${revision}`}
                label={spec.label}
                defaultValue={typeof value === "number" ? value : Number.NaN}
                formatOptions={moneyInputFormat(currency)}
                isInvalid={problem !== undefined}
                errorMessage={problem}
                onInputChange={(text) => {
                  const reading = readNumberText(text);
                  if (reading.kind === "empty") onChange(spec.key, null);
                  else if (reading.kind === "value") onChange(spec.key, reading.value);
                }}
                onBlur={onBlur}
              />
            );
          case "choice":
            return spec.control === "segmented" ? (
              <Stack key={spec.key} gap="space-50" align="start">
                <Text variant="label" as="span">
                  {spec.label}
                </Text>
                <SegmentedControl
                  aria-label={spec.label}
                  value={typeof value === "string" ? value : ""}
                  onChange={(next) => onChange(spec.key, next, { immediate: true })}
                >
                  {spec.options.map((option) => (
                    <SegmentedControlItem key={option.id} value={option.id}>
                      {option.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </Stack>
            ) : (
              <Picker
                key={spec.key}
                label={spec.label}
                value={typeof value === "string" ? value : NONE}
                onChange={(next) =>
                  onChange(spec.key, next === null || next === NONE ? null : next, {
                    immediate: true,
                  })
                }
              >
                <PickerItem id={NONE}>{t("research:notSet")}</PickerItem>
                {spec.options.map((option) => (
                  <PickerItem key={option.id} id={option.id}>
                    {option.label}
                  </PickerItem>
                ))}
              </Picker>
            );
          default:
            return (
              <CheckboxGroup
                key={spec.key}
                label={spec.label}
                value={Array.isArray(value) ? value : []}
                onChange={(next) => onChange(spec.key, next, { immediate: true })}
              >
                {spec.options.map((option) => (
                  <Checkbox key={option.id} value={option.id}>
                    {option.label}
                  </Checkbox>
                ))}
              </CheckboxGroup>
            );
        }
      })}
    </Stack>
  );
}

/** What a field holds as text, or null when it holds nothing. */
export function fieldText(
  spec: FieldSpec,
  value: FieldValue,
  currency: string,
  timeZone: string,
): string | null {
  switch (spec.kind) {
    case "money":
      return typeof value === "number" ? formatMoney(value, currency) : null;
    case "date":
      return typeof value === "string" && value !== "" ? formatDate(value, timeZone) : null;
    case "choice":
      return spec.options.find((option) => option.id === value)?.label ?? null;
    case "checks": {
      const labels = (Array.isArray(value) ? value : []).map(
        (id) => spec.options.find((option) => option.id === id)?.label ?? id,
      );
      return labels.length > 0 ? labels.join(", ") : null;
    }
    default:
      return typeof value === "string" && value.trim() !== "" ? value : null;
  }
}

function ReadOnlyField({
  spec,
  value,
  currency,
  timeZone,
}: {
  spec: FieldSpec;
  value: FieldValue;
  currency: string;
  timeZone: string;
}) {
  const { t } = useTranslation("research");
  const text = fieldText(spec, value, currency, timeZone);
  return (
    <Stack gap="space-50">
      <Text variant="caption" tone="secondary">
        {spec.label}
      </Text>
      <Text variant="body-long" tone={text === null ? "secondary" : undefined}>
        {text ?? t("none")}
      </Text>
    </Stack>
  );
}
