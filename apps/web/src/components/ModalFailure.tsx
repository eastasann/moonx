import { AlertDialog, Button, Flex, InlineAlert, Text } from "@moonx/ui-web";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../lib/api";
import { rejectionReason } from "../lib/autosave";
import { isTransient } from "../lib/query";
import { rateLimitWords } from "./SendFailure";
import { reportOnce } from "./states";

/**
 * A send that failed inside a modal (design-spec 6.0.6「モーダルの共通の決まり」, 6.0.2),
 * what was typed kept: the network or an API that is down as "Couldn't save" and Retry, a
 * refusal for good with its reason, a rate limit with its wait, all where the modal's
 * fields are; anything else in the small dialog with its Ref, Retry and Close, which
 * closes the modal. A lost session takes the app's way (M9 or the sign-in screen,
 * router.tsx) and shows nothing here.
 */
export function ModalSendFailure({
  error,
  onRetry,
  isRetryDisabled = false,
  onClose,
}: {
  error: unknown;
  onRetry: () => void;
  isRetryDisabled?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(["app"]);
  const isApi = error instanceof ApiError;
  const rateLimited = rateLimitWords(error);
  const reason = isApi ? rejectionReason(error) : null;
  const isSignedOut = isApi && error.status === 401;
  const isUnexpected =
    !isSignedOut &&
    rateLimited === null &&
    reason === null &&
    !isTransient(error);
  // The API's request id, or the Sentry event of the Web's own failure (SDD 8.2).
  const reference = useMemo(
    () => (!isUnexpected ? null : isApi ? error.requestId : reportOnce(error)),
    [isUnexpected, isApi, error],
  );
  if (isSignedOut) return null;
  if (isUnexpected) {
    return (
      <AlertDialog
        isOpen
        variant="error"
        size="S"
        title={t("app:state.unexpected")}
        primaryActionLabel={t("app:state.retry")}
        cancelLabel={t("app:state.close")}
        onPrimaryAction={onRetry}
        isPrimaryActionDisabled={isRetryDisabled}
        onCancel={onClose}
      >
        {reference === null
          ? ""
          : t("app:state.ref", { ref: reference.slice(0, 8) })}
      </AlertDialog>
    );
  }
  return (
    <InlineAlert variant="negative">
      <Flex gap="space-200" wrap alignItems="center">
        <Text>{rateLimited ?? t("app:state.couldNotSave")}</Text>
        {reason !== null && (
          <Text tone="secondary">{t(`app:save.reason.${reason}`)}</Text>
        )}
        {rateLimited === null && (
          <Button
            variant="secondary"
            size="S"
            onPress={onRetry}
            isDisabled={isRetryDisabled}
          >
            {t("app:state.retry")}
          </Button>
        )}
      </Flex>
    </InlineAlert>
  );
}
