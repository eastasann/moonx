import { ToastQueue } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AuthError, signOut } from "../lib/auth";
import { useAutosave } from "../lib/autosave-react";
import { rateLimitWords } from "./SendFailure";
import { reportOnce } from "./states";

/**
 * Logs out (A4) and opens 1 (design-spec 5章「共通ナビ」), the cache of the user's data
 * and any unsaved input dropped first (SDD 8.2, ADR-021). If the API cannot end the session, the user stays where they
 * are, and a toast says it went wrong with its Ref and Retry (6.0.6「想定外のエラー」, or
 * 「回数の上限」 with the wait):
 * leaving as if signed out would bring them straight back, the session being alive.
 *
 * @param to Where to go once signed out, in place of 1.
 */
export function useLogOut(to = "/"): () => void {
  const { t } = useTranslation(["app"]);
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const router = useRouter();
  const pending = useRef(false);
  const logOut = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      try {
        await signOut();
      } catch (error) {
        // The API's request id, or the Sentry event of the Web's own failure; none for
        // the network, which the offline band may already tell (SDD 8.2).
        const reference =
          error instanceof AuthError ? error.requestId : reportOnce(error);
        // With an action the toast stays until it is pressed or closed (4.5 Toast).
        ToastQueue.neutral(
          rateLimitWords(error) ??
            (reference === null
              ? t("app:state.unexpected")
              : t("app:state.unexpectedRef", { ref: reference.slice(0, 8) })),
          {
            actionLabel: t("app:state.retry"),
            onAction: () => void logOut(),
            shouldCloseOnAction: true,
          },
        );
        return;
      }
      autosave.discardAll();
      queryClient.clear();
      await router.navigate({ href: to }).catch(reportOnce);
    } finally {
      pending.current = false;
    }
  }, [autosave, queryClient, router, t, to]);
  return useCallback(() => void logOut(), [logOut]);
}
