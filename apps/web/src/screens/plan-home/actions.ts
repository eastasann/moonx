import { useMutation } from "@tanstack/react-query";
import { sendJson } from "../../lib/api";
import { type PlanSummary, usePlanRefresh } from "../../lib/plans";

/** P3: archive or restore one plan, then refresh everything that lists or counts it. */
export function usePlanArchive(planId: string) {
  const refresh = usePlanRefresh();
  return useMutation({
    mutationFn: (archive: boolean) =>
      sendJson<PlanSummary>("POST", `/api/v1/plans/${planId}/${archive ? "archive" : "restore"}`),
    onSuccess: () => refresh(planId),
  });
}
