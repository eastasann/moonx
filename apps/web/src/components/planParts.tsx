import type { PlanHome } from "@moonx/schemas";
import { Button, InlineAlert } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, inPath, unwrap } from "../lib/api";
import { ideaKey, workspaceKey } from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { toastFailure } from "./ideaActions";
import { useWorkspace } from "./workspace";

// What 20 and 21 share of a plan (design-spec 6.12「案のアーカイブ」).

/**
 * Archive and restore a plan (P3, design-spec 6.12「案のアーカイブ」), one at a time; a
 * failure says so in a toast with Retry. 13, 5 and 6 read the plans and stage again.
 */
export function usePlanActions() {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const pending = useRef(false);
  const sendThrough = useSendThrough();
  const setArchived = useCallback(
    async (plan: PlanHome, archived: boolean): Promise<void> => {
      if (pending.current) return;
      pending.current = true;
      try {
        await sendThrough(async () => {
          const plans = api().api.v1.plans({ planId: inPath(plan.id) });
          await unwrap(archived ? plans.archive.post() : plans.restore.post());
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ideaKey(plan.ideaId) }),
            queryClient.invalidateQueries({
              queryKey: workspaceKey(workspace.id),
            }),
          ]);
        });
      } catch (error) {
        toastFailure(error, () => void setArchived(plan, archived));
      } finally {
        pending.current = false;
      }
    },
    [queryClient, sendThrough, workspace.id],
  );
  return {
    archive: (plan: PlanHome) => void setArchived(plan, true),
    restore: (plan: PlanHome) => void setArchived(plan, false),
  };
}

/**
 * "This plan is archived" at the top of 20 and 21 (design-spec 6.12「案のアーカイブ」),
 * with Restore for the Owners and Members.
 */
export function ArchivedPlanAlert({ home }: { home: PlanHome }) {
  const { t } = useTranslation(["plans"]);
  const { role } = useWorkspace();
  const actions = usePlanActions();
  return (
    <InlineAlert title={t("plans:home.archived")}>
      {role !== "viewer" && (
        <Button
          variant="secondary"
          size="S"
          onPress={() => actions.restore(home)}
        >
          {t("plans:home.restore")}
        </Button>
      )}
    </InlineAlert>
  );
}
