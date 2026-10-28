import { formatInputNumber, i18n } from "@moonx/i18n";
import type { InputRule } from "@moonx/schemas";
import type { z } from "zod";

const ruleMessages = {
  required: () => i18n.t("errors:input.required"),
  decimals: (params) =>
    i18n.t("errors:input.decimals", { count: Number(params.digits) }),
  positive: () => i18n.t("errors:input.positive"),
  nul_character: () => i18n.t("errors:input.unsavableCharacter"),
  lone_surrogate: () => i18n.t("errors:input.unsavableCharacter"),
  number_format: () => i18n.t("errors:input.numberFormat"),
  currency: () => i18n.t("errors:input.currency"),
  time_zone: () => i18n.t("errors:input.timeZone"),
  unique: () => i18n.t("errors:input.unique"),
} as const satisfies Record<
  InputRule,
  (params: Record<string, unknown>) => string
>;

const isRule = (rule: unknown): rule is InputRule =>
  typeof rule === "string" && Object.hasOwn(ruleMessages, rule);

const shown = (bound: number | bigint) => formatInputNumber(Number(bound));

/**
 * What a field shows under it for an issue of the shared Zod schemas (SDD 9章「入力の
 * 検査の文言」): chosen by the issue's code and its params, never its `message`, which is
 * for developers. A number's bounds read in the unit typed: a % field checks the typed
 * 0–100 (`percentInputSchema`), not the stored rate.
 *
 * @throws {Error} for an issue no field input raises (an object's keys, a union's
 * branches), so a form whose schema can raise one fails in its tests instead of
 * showing nothing.
 */
export function inputIssueMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "custom": {
      const rule = issue.params?.rule;
      if (isRule(rule)) return ruleMessages[rule](issue.params ?? {});
      break;
    }
    case "too_small":
      if (issue.origin === "string") {
        return i18n.t("errors:input.tooShort", {
          minimum: shown(issue.minimum),
        });
      }
      if (issue.origin === "number") {
        return i18n.t(
          issue.inclusive === false
            ? "errors:input.greaterThan"
            : "errors:input.atLeast",
          { minimum: shown(issue.minimum) },
        );
      }
      break;
    case "too_big":
      if (issue.origin === "string") {
        return i18n.t("errors:input.tooLong", {
          maximum: shown(issue.maximum),
        });
      }
      if (issue.origin === "number") {
        return i18n.t(
          issue.inclusive === false
            ? "errors:input.lessThan"
            : "errors:input.atMost",
          { maximum: shown(issue.maximum) },
        );
      }
      break;
    case "invalid_type":
      if (issue.expected === "int") return i18n.t("errors:input.wholeNumber");
      if (issue.expected === "number") return i18n.t("errors:input.number");
      break;
    case "invalid_format":
      if (issue.format === "email") return i18n.t("errors:input.email");
      if (issue.format === "url") return i18n.t("errors:input.url");
      if (issue.format === "date") return i18n.t("errors:input.date");
      if (issue.format === "datetime") return i18n.t("errors:input.dateTime");
      return i18n.t("errors:input.format");
    case "invalid_value":
      return i18n.t("errors:input.choice");
  }
  throw new Error(
    `No message for the input issue ${issue.code} (${JSON.stringify(issue.path)})`,
  );
}

/** Why `value` breaks the rule `schema` holds (6.0.8), in the field's words, or undefined. */
export function ruleErrorOf(
  schema: z.ZodType,
  value: unknown,
): string | undefined {
  const [issue] = schema.safeParse(value).error?.issues ?? [];
  return issue === undefined ? undefined : inputIssueMessage(issue);
}
