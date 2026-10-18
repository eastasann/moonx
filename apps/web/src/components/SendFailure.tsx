import { formatWaitTime, i18n } from "@moonx/i18n";
import { Button, Flex, InlineAlert, Text } from "@moonx/ui-web";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../lib/api";
import { AuthError } from "../lib/auth";
import { reportOnce } from "./states";

/** The code of a failed call to the API or to Better Auth, or null. */
export function failureCode(error: unknown): string | null {
  return error instanceof ApiError || error instanceof AuthError
    ? error.code
    : null;
}

/** The network, or an API that is not up: a send that may pass next time. */
const isTransient = (error: unknown) =>
  (error instanceof ApiError || error instanceof AuthError) &&
  (error.status === null || error.code === "UPSTREAM_UNAVAILABLE");

/** The wait of a 429: `retryAfterSeconds` on the API's paths, `X-Retry-After` on Better Auth's (SDD 8.2). */
function retryAfterOf(error: unknown): number | null {
  if (error instanceof AuthError) return error.retryAfterSeconds;
  if (error instanceof ApiError) {
    const seconds = error.detail.retryAfterSeconds;
    return typeof seconds === "number" ? seconds : null;
  }
  return null;
}

/**
 * "Too many attempts. Try again in {wait}." for a rate limit (6.0.6「回数の上限」), with
 * the wait when the answer gives one; null for any other failure.
 */
export function rateLimitWords(error: unknown): string | null {
  if (failureCode(error) !== "RATE_LIMITED") return null;
  const wait = retryAfterOf(error);
  return wait === null
    ? i18n.t("errors:RATE_LIMITED", { context: "later" })
    : i18n.t("errors:RATE_LIMITED", { wait: formatWaitTime(wait) });
}

export interface SendFailureProps {
  /** What the send failed with: an ApiError, an AuthError, or a failure of the Web's own. */
  error: unknown;
  /** The screen's words for the codes it expects (design-spec 6.16「状態とエラー」), by code. */
  messages?: Partial<Record<string, string>>;
  /**
   * What the network or an API that is down reads as: "Couldn't save" where the send
   * saves something (6.0.2, the modals' rule of 6.0.6), else an unexpected error.
   * @default "unexpected"
   */
  transient?: "couldNotSave" | "unexpected";
  /** Sends again with what is typed, which the failure leaves in place. */
  onRetry: () => void;
  isRetryDisabled?: boolean;
}

/**
 * Why a form's send failed, near its button (design-spec 6.0.6): the screen's words for a
 * code it expects, "Too many attempts…" for a rate limit, and otherwise "Something went
 * wrong" with the `Ref` someone asking for help quotes, and Retry (SDD 8.2).
 */
export function SendFailure({
  error,
  messages = {},
  transient = "unexpected",
  onRetry,
  isRetryDisabled = false,
}: SendFailureProps) {
  const { t } = useTranslation(["app"]);
  const code = failureCode(error);
  const expected = code === null ? undefined : messages[code];
  const rateLimited = rateLimitWords(error);
  const isRateLimited = rateLimited !== null;
  const isUnexpected =
    expected === undefined &&
    !isRateLimited &&
    !(transient === "couldNotSave" && isTransient(error));
  // The API's request id, or the Sentry event of the Web's own failure (SDD 8.2).
  const reference = useMemo(
    () =>
      !isUnexpected
        ? null
        : error instanceof ApiError || error instanceof AuthError
          ? error.requestId
          : reportOnce(error),
    [isUnexpected, error],
  );
  if (expected !== undefined) {
    return <InlineAlert variant="negative">{expected}</InlineAlert>;
  }
  if (rateLimited !== null) {
    return <InlineAlert variant="negative">{rateLimited}</InlineAlert>;
  }
  return (
    <InlineAlert variant="negative">
      <Flex gap="space-200" wrap alignItems="center">
        <Text>
          {isUnexpected
            ? t("app:state.unexpected")
            : t("app:state.couldNotSave")}
        </Text>
        {reference !== null && (
          <Text variant="caption" tone="secondary">
            {t("app:state.ref", { ref: reference.slice(0, 8) })}
          </Text>
        )}
        <Button
          variant="secondary"
          size="S"
          onPress={onRetry}
          isDisabled={isRetryDisabled}
        >
          {t("app:state.retry")}
        </Button>
      </Flex>
    </InlineAlert>
  );
}
