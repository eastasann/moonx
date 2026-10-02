import type { TFunction } from "i18next";
import { isApiError } from "./api-error";

/**
 * The catalog text for a failed call (SDD 8.2): the API's code picks `errors:<CODE>`, and the
 * `message` of the envelope is never shown. Codes only the client knows live in `auth:errors`.
 */
export function errorText(t: TFunction, error: unknown): string {
  if (!isApiError(error)) return t("errors:INTERNAL");
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return t("auth:errors.invalidCredentials");
    case "INVALID_TOKEN":
      return t("auth:errors.invalidToken");
    case "NETWORK":
      return t("errors:UPSTREAM_UNAVAILABLE");
    case "UNKNOWN":
      return t("errors:INTERNAL");
    case "INVITATION_EMAIL_MISMATCH":
      return t("errors:INVITATION_EMAIL_MISMATCH", {
        email: typeof error.extra.invitedEmail === "string" ? error.extra.invitedEmail : "",
      });
    default:
      return t(`errors:${error.code}`);
  }
}

/** The eight characters a person reads out when they report a failure (design-spec 6.0.6). */
export function errorReference(error: unknown): string | null {
  return isApiError(error) && error.requestId ? error.requestId.slice(0, 8) : null;
}
