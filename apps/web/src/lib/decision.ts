import { decisionValueSchema, type RecordDecisionBody } from "@moonx/schemas";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, call } from "./api";
import { isApiError } from "./api-error";
import { IDEAS_KEY } from "./idea-actions";
import { HOME_METRIC_KEYS, type HomeMetricKey } from "./validation-home";

/** Screen 7's queries live under this prefix, so a recorded decision refreshes the log. */
export const DECISION_LOG_KEY = ["decision-log"] as const;

const fetchContext = (ideaId: string) =>
  call(api().api.v1.ideas({ ideaId })["decision-context"].get());

/** V18: what the decision rests on. */
export type DecisionContext = Awaited<ReturnType<typeof fetchContext>>;

/**
 * Always read again on open: `lastDecision.id` is what V19 is checked against, so a cached copy
 * would hide a decision someone recorded in between.
 */
export const decisionContextQuery = (ideaId: string) =>
  queryOptions({
    queryKey: [...IDEAS_KEY, "decision-context", ideaId],
    queryFn: () => fetchContext(ideaId),
    staleTime: 0,
    gcTime: 0,
  });

/** What the 409 of V19 carries of the decision recorded in the meantime. */
const latestSchema = z.object({
  value: decisionValueSchema,
  recordedAt: z.union([z.iso.datetime(), z.date()]),
  recordedBy: z.object({ displayName: z.string() }),
  reasonExcerpt: z.string().nullable(),
});
export type LatestDecision = z.infer<typeof latestSchema>;

/** The newer decision of a 409 DECISION_CHANGED, or null for any other error. */
export function readDecisionChanged(error: unknown): LatestDecision | null {
  if (!isApiError(error) || error.code !== "DECISION_CHANGED") return null;
  const latest = latestSchema.safeParse(error.extra.latest);
  return latest.success ? latest.data : null;
}

/**
 * V19. Everything that shows a decision is refreshed before the caller navigates: the ideas (the
 * list, the home's stage and history), the decision log and the notifications of the others.
 */
export function useRecordDecision(ideaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordDecisionBody) =>
      call(api().api.v1.ideas({ ideaId }).decisions.post(body)),
    onSuccess: async () => {
      await Promise.all(
        [IDEAS_KEY, DECISION_LOG_KEY, ["notifications"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

/** The home's key numbers plus ROI (design-spec 6.5). */
export const DECISION_METRIC_KEYS: HomeMetricKey[] = [...HOME_METRIC_KEYS, "simple_roi"];
