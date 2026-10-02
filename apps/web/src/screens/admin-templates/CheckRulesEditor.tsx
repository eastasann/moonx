import { DEFAULT_CHECK_RULES } from "@moonx/domain";
import type { TemplateVersionDetail } from "@moonx/schemas";
import { Heading, NumberField, Stack, Text } from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedPatch, useTemplateWrites } from "../../lib/admin-templates";

type Rules = typeof DEFAULT_CHECK_RULES;

/** Each threshold: its check and the name of its parameter. */
const FIELDS = [
  { check: "competitors", param: "min", min: 1 },
  { check: "competitors", param: "max", min: 1 },
  { check: "local_price", param: "pricedCompetitors", min: 0 },
  { check: "local_price", param: "researchLogs", min: 0 },
  { check: "permits", param: "researchLogs", min: 0 },
  { check: "demand_signal", param: "researchLogs", min: 0 },
] as const;

/** The version's thresholds, with the defaults of the domain for a check the version has no row for. */
function rulesOf(detail: TemplateVersionDetail): Rules {
  const rules: Rules = structuredClone(DEFAULT_CHECK_RULES);
  for (const rule of detail.checkRules) {
    if (rule.checkKey in rules) {
      Object.assign(rules[rule.checkKey as keyof Rules], rule.params);
    }
  }
  return rules;
}

/**
 * The thresholds of the validation's checks (design-spec 6.17 27): how many competitors, how many
 * priced ones, how many research logs tagged to a check. Checks 3 and 4 (costs, break-even) have
 * none. The whole set is saved together, since the API replaces the list.
 */
export function CheckRulesEditor({
  detail,
  readOnly,
}: {
  detail: TemplateVersionDetail;
  readOnly: boolean;
}) {
  const { t } = useTranslation("admin");
  const { checkRules } = useTemplateWrites(detail.id);
  const [rules, setRules] = useState<Rules>(() => rulesOf(detail));
  const { schedule, flush } = useDebouncedPatch(({ next }: { next: Rules }) =>
    checkRules.mutateAsync(
      (Object.keys(next) as (keyof Rules)[]).map((checkKey) => ({
        checkKey,
        params: { ...next[checkKey] },
      })),
    ),
  );
  const rangeInvalid = rules.competitors.min > rules.competitors.max;

  const change = (check: keyof Rules, param: string, value: number) => {
    const next = structuredClone(rules);
    (next[check] as Record<string, number>)[param] = value;
    setRules(next);
    if (next.competitors.min <= next.competitors.max) schedule({ next });
  };

  return (
    <Stack gap="space-300">
      <Heading level={2}>{t("edit.checks.heading")}</Heading>
      <Text tone="secondary">{t("edit.checks.help")}</Text>
      {FIELDS.map(({ check, param, min }) => (
        <NumberField
          key={`${check}.${param}`}
          label={checkLabel(t, check, param)}
          value={(rules[check] as Record<string, number>)[param]}
          minValue={min}
          step={1}
          isReadOnly={readOnly}
          isInvalid={rangeInvalid && check === "competitors"}
          errorMessage={
            rangeInvalid && check === "competitors" ? t("edit.checks.rangeInvalid") : undefined
          }
          onChange={(value) => {
            if (!Number.isNaN(value)) change(check, param, value);
          }}
          onBlur={flush}
        />
      ))}
    </Stack>
  );
}

function checkLabel(t: TFunction, check: string, param: string) {
  switch (`${check}.${param}`) {
    case "competitors.min":
      return t("edit.checks.competitorsMin");
    case "competitors.max":
      return t("edit.checks.competitorsMax");
    case "local_price.pricedCompetitors":
      return t("edit.checks.localPricePriced");
    case "local_price.researchLogs":
      return t("edit.checks.localPriceLogs");
    case "permits.researchLogs":
      return t("edit.checks.permitsLogs");
    default:
      return t("edit.checks.demandLogs");
  }
}
