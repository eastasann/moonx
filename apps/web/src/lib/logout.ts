import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authCall, authClient } from "./auth-client";
import { errorText } from "./error-text";
import { useGoTo } from "./navigate";
import { applyTheme } from "./theme";
import { toasts } from "./toast";

/**
 * Ends the session and goes to the landing page, or to the login screen that returns to `next`.
 * The cache is emptied so the next person on this browser never sees the last one's data.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const { t } = useTranslation();
  return async (options: { next?: string } = {}) => {
    try {
      await authCall(authClient().signOut());
    } catch (error) {
      toasts.add({ title: errorText(t, error), variant: "negative" });
      return;
    }
    queryClient.clear();
    applyTheme(undefined);
    goTo(options.next ? `/login?next=${encodeURIComponent(options.next)}` : "/");
  };
}
