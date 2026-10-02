import type { TFunction } from "i18next";
import type { z } from "zod";

/** A `refine` message that names a catalog key instead of text; `validate` translates it. */
export const catalogMessage = (key: string) => `i18n:${key}`;

function issueText(t: TFunction, issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return t("app:form.required");
    case "too_small":
      return issue.origin === "string" && Number(issue.minimum) <= 1
        ? t("app:form.required")
        : t("app:form.tooShort", { count: Number(issue.minimum) });
    case "too_big":
      return t("app:form.tooLong", { count: Number(issue.maximum) });
    case "invalid_format":
      return issue.format === "email" ? t("app:form.email") : t("app:form.invalid");
    case "custom":
      return issue.message.startsWith("i18n:") ? t(issue.message.slice(5)) : t("app:form.invalid");
    default:
      return t("app:form.invalid");
  }
}

/**
 * A TanStack Form validator that checks the value with a Zod schema and reports the first problem
 * of each field in catalog text (design-spec 6.0.6, "value out of range"). Zod's own English
 * messages are never shown.
 */
export function validate(schema: z.ZodType, t: TFunction) {
  return ({ value }: { value: unknown }) => {
    const result = schema.safeParse(value);
    if (result.success) return undefined;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const name = String(issue.path[0] ?? "");
      if (name && !(name in fields)) fields[name] = issueText(t, issue);
    }
    return { fields };
  };
}

/** The props a field component needs from a TanStack Form field. */
export function fieldProps(field: {
  state: { value: unknown; meta: { errors: unknown[] } };
  handleChange: (value: never) => void;
  handleBlur: () => void;
}) {
  const message = field.state.meta.errors
    .map((error) =>
      typeof error === "string" ? error : (error as { message?: string } | undefined)?.message,
    )
    .find(Boolean);
  return {
    value: field.state.value as string,
    onChange: field.handleChange as (value: string) => void,
    onBlur: field.handleBlur,
    isInvalid: Boolean(message),
    errorMessage: message,
  };
}
