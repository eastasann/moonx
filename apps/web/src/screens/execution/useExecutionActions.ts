import type { ExecutionType } from "@moonx/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { autosave } from "../../lib/autosave";
import { errorText } from "../../lib/error-text";
import { deleteExecutionItem, putExecutionOrder } from "../../lib/execution";
import { type ExecutionItem, executionItemsKey } from "../../lib/plans";
import { toasts } from "../../lib/toast";

type Rows = { items: ExecutionItem[] };

/**
 * Deleting and placing the rows of one execution type, for screen 22 and for screen 21's
 * execution sub-items (the same data). A delete waits for the row's own saves first, so no input
 * lands on a row that is gone; a move is read back from the server, which owns the order.
 */
export function useExecutionActions(planId: string, type: ExecutionType, onChanged: () => void) {
  const { t } = useTranslation("execution");
  const queryClient = useQueryClient();
  const key = executionItemsKey(planId, type);
  const failed = (title: string) => (error: unknown) =>
    toasts.add({ title, description: errorText(t, error), variant: "negative" });

  const remove = useMutation({
    mutationFn: async (item: ExecutionItem) => {
      await autosave.idle();
      await deleteExecutionItem(item.id);
      return item;
    },
    onSuccess: (item) => {
      queryClient.setQueryData<Rows>(key, (old) =>
        old ? { items: old.items.filter((row) => row.id !== item.id) } : old,
      );
      onChanged();
      toasts.add({ title: t("execution:deleted"), variant: "informative" });
    },
    onError: failed(t("execution:deleteFailed")),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => putExecutionOrder(planId, type, ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: failed(t("execution:moveFailed")),
  });

  return { remove, reorder };
}
