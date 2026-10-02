import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { autosave } from "./autosave";
import { IDEAS_KEY } from "./idea-actions";
import { validationKey } from "./validation-keys";

/**
 * For the screens that fill the validation's lists (14, 15, 16). A change there moves the checks
 * and the counts of 13 and 6, whose copies stay fresh for 30 seconds, so `changed` marks them
 * stale. Saves still on their way when the screen closes are awaited, then everything under the
 * validation is read again by whoever opens it next.
 */
export function useValidationRefresh(validationId: string): { changed: () => void } {
  const queryClient = useQueryClient();
  useEffect(
    () => () => {
      void autosave
        .idle()
        .then(() =>
          Promise.all([
            queryClient.invalidateQueries({ queryKey: validationKey(validationId) }),
            queryClient.invalidateQueries({ queryKey: IDEAS_KEY }),
          ]),
        );
    },
    [queryClient, validationId],
  );
  const changed = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
  }, [queryClient]);
  return { changed };
}
