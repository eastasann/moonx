import { formatInputNumber } from "@moonx/i18n";
import {
  type Competitor,
  type CompetitorType,
  competitorTypeSchema,
  longTextSchema,
  moneySchema,
  numberTextSchema,
  requiredShortTextSchema,
  shortTextSchema,
} from "@moonx/schemas";
import {
  Flex,
  NumberField,
  Picker,
  Stack,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { inputIssueMessage } from "../lib/input-issues";
import type { RowFieldsSpec } from "./RowFields";

/** A competitor as its fields hold it (design-spec 6.10・6.0.8). */
export interface CompetitorValues {
  name: string;
  type: CompetitorType | null;
  targetCustomer: string;
  offering: string;
  /** The amount as typed ("1,500.50"), blank for none. */
  typicalPrice: string;
  priceNote: string;
  strength: string;
  weakness: string;
  whyChosen: string;
  whySurvive: string;
}

export type CompetitorField = keyof CompetitorValues;

/** The long texts of a competitor, in the order 15 shows them (design-spec 6.10). */
export const COMPETITOR_TEXTS = [
  "targetCustomer",
  "offering",
  "strength",
  "weakness",
  "whyChosen",
  "whySurvive",
] as const;

/** The fields as a competitor fills them: blank for what it does not hold. */
export const competitorValues = (competitor: Competitor): CompetitorValues => ({
  name: competitor.name,
  type: competitor.type,
  targetCustomer: competitor.targetCustomer ?? "",
  offering: competitor.offering ?? "",
  typicalPrice:
    competitor.typicalPrice === null
      ? ""
      : formatInputNumber(competitor.typicalPrice),
  priceNote: competitor.priceNote ?? "",
  strength: competitor.strength ?? "",
  weakness: competitor.weakness ?? "",
  whyChosen: competitor.whyChosen ?? "",
  whySurvive: competitor.whySurvive ?? "",
});

export const newCompetitorValues = (): CompetitorValues => ({
  name: "",
  type: null,
  targetCustomer: "",
  offering: "",
  typicalPrice: "",
  priceNote: "",
  strength: "",
  weakness: "",
  whyChosen: "",
  whySurvive: "",
});

const priceSchema = numberTextSchema(moneySchema);

/** The fields' rules and how they travel (6.0.8, SDD 5.7 V8・V9). */
export const competitorSpec: RowFieldsSpec<CompetitorValues> = {
  errorOf: (field, value) => {
    const result = (() => {
      switch (field) {
        case "name":
          return requiredShortTextSchema.safeParse(value);
        case "type":
          return competitorTypeSchema.nullable().safeParse(value);
        case "typicalPrice":
          // Blank is no price; anything else is read as an amount.
          return typeof value === "string" && value.trim() === ""
            ? { success: true as const }
            : priceSchema.safeParse(value);
        case "priceNote":
          return shortTextSchema.safeParse(value);
        default:
          return longTextSchema.safeParse(value);
      }
    })();
    const [issue] = result.success ? [] : result.error.issues;
    return issue === undefined ? undefined : inputIssueMessage(issue);
  },
  // The texts as typed: the API saves blank as none.
  toWire: (field, value) =>
    field === "typicalPrice"
      ? typeof value === "string" && value.trim() !== ""
        ? priceSchema.parse(value)
        : null
      : value,
  fromWire: (field, value) =>
    (field === "typicalPrice"
      ? typeof value === "number"
        ? formatInputNumber(value)
        : ""
      : field === "type"
        ? (value ?? null)
        : (value ?? "")) as never,
  isChoice: (field) => field === "type",
};

/** A new competitor's fields as V8 POST takes them. */
export const competitorInput = (values: CompetitorValues) => ({
  name: values.name,
  ...Object.fromEntries(
    (Object.keys(values) as CompetitorField[])
      .filter((field) => field !== "name")
      .map((field) => [field, competitorSpec.toWire(field, values[field])]),
  ),
});

/** The Type picker's item for none: a competitor need not have one (6.0.8). */
const NO_TYPE = "none";

/**
 * A competitor's fields (design-spec 6.10, 15's dialog): Name (required), Type, Target
 * Customer, Offering, Typical Price with its Price note, Strength, Weakness, Why Customers
 * Choose Them and Why They Survive. Each says under it why its value breaks its rule
 * (6.0.8); the screen decides what is sent. `evidence` sits last, as 6.10 lists it.
 */
export function CompetitorFields({
  values,
  errors = {},
  onChange,
  onBlur,
  currency,
  isReadOnly = false,
  autoFocus = false,
  evidence,
}: {
  values: CompetitorValues;
  errors?: Partial<Record<CompetitorField, string>>;
  onChange: <F extends CompetitorField>(
    field: F,
    value: CompetitorValues[F],
  ) => void;
  /** A text field was left (6.0.2: what waits is saved). */
  onBlur?: (field: CompetitorField) => void;
  /** The workspace's currency, beside the price. */
  currency: string;
  isReadOnly?: boolean;
  /** Name takes focus on opening (a new competitor). */
  autoFocus?: boolean;
  evidence?: ReactNode;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const textProps = (field: Exclude<CompetitorField, "type">) => ({
    value: values[field],
    onChange: (value: string) => onChange(field, value),
    onBlur: () => onBlur?.(field),
    errorMessage: errors[field],
    isReadOnly,
    width: "full" as const,
  });
  return (
    <Stack gap="space-300">
      <TextField
        {...textProps("name")}
        label={t("validation:competitors.field.name")}
        isRequired
        autoFocus={autoFocus}
      />
      <Picker
        label={t("validation:competitors.field.type")}
        items={[
          { id: NO_TYPE, label: t("validation:competitors.field.noType") },
          ...competitorTypeSchema.options.map((id) => ({
            id,
            label: t(`common:competitorType.${id}`),
          })),
        ]}
        value={values.type ?? NO_TYPE}
        onChange={(value) =>
          onChange(
            "type",
            value === null || value === NO_TYPE
              ? null
              : competitorTypeSchema.parse(value),
          )
        }
        errorMessage={errors.type}
        isDisabled={isReadOnly}
        width="full"
      />
      <TextArea
        {...textProps("targetCustomer")}
        label={t("validation:competitors.field.targetCustomer")}
      />
      <TextArea
        {...textProps("offering")}
        label={t("validation:competitors.field.offering")}
      />
      <Flex gap="space-300" wrap alignItems="start">
        <NumberField
          {...textProps("typicalPrice")}
          width="default"
          label={t("validation:competitors.field.typicalPrice")}
          currency={currency}
        />
        <TextField
          {...textProps("priceNote")}
          width="default"
          label={t("validation:competitors.field.priceNote")}
          description={t("validation:competitors.field.priceNoteExample")}
        />
      </Flex>
      <TextArea
        {...textProps("strength")}
        label={t("validation:competitors.field.strength")}
      />
      <TextArea
        {...textProps("weakness")}
        label={t("validation:competitors.field.weakness")}
      />
      <TextArea
        {...textProps("whyChosen")}
        label={t("validation:competitors.field.whyChosen")}
      />
      <TextArea
        {...textProps("whySurvive")}
        label={t("validation:competitors.field.whySurvive")}
      />
      {evidence}
    </Stack>
  );
}
