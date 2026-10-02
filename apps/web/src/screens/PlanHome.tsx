import { HubPattern, Stack } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { NoAccessState, QueryBoundary } from "../components/states";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import { type PlanHome as PlanHomeData, planHomeQuery } from "../lib/plans";
import { usePlanAccess } from "./plan-home/access";
import { PlanEntries } from "./plan-home/Entries";
import { PlanHeader } from "./plan-home/PlanHeader";
import { PlanHomeSkeleton } from "./plan-home/PlanHomeSkeleton";
import { PlanExecution, PlanGoNoGo, PlanKeyNumbers, PlanVersions } from "./plan-home/StatusBlocks";

function PlanHomeContent({
  plan,
  workspaceId,
  ideaId,
}: {
  plan: PlanHomeData;
  workspaceId: string;
  ideaId: string;
}) {
  const access = usePlanAccess(plan, workspaceId);
  // Another workspace's or idea's URL must not show the plan (SDD 4).
  if (plan.workspaceId !== workspaceId || plan.ideaId !== ideaId) return <NoAccessState />;
  const block = { plan, workspaceId, ideaId, access };
  return (
    <HubPattern
      header={<PlanHeader plan={plan} workspaceId={workspaceId} ideaId={ideaId} access={access} />}
      summary={<PlanKeyNumbers {...block} />}
      status={
        <Stack gap="space-400">
          <PlanGoNoGo {...block} />
          <PlanVersions {...block} />
          <PlanExecution {...block} />
        </Stack>
      }
      entries={<PlanEntries plan={plan} workspaceId={workspaceId} ideaId={ideaId} />}
    />
  );
}

/**
 * Screen 20, the plan home: the plan's state on the left and its 30 items on the right
 * (design-spec 6.12). `versionId` shows a saved version read only.
 */
export function PlanHome({
  workspaceId,
  ideaId,
  planId,
  versionId,
}: {
  workspaceId: string;
  ideaId: string;
  planId: string;
  versionId?: string;
}) {
  const query = useQuery(planHomeQuery(planId, versionId));
  usePanelTarget(formatContainerTarget("business_plan", planId));
  return (
    <QueryBoundary query={query} skeleton={<PlanHomeSkeleton />}>
      {(plan) => (
        <PlanHomeContent
          // The header keeps the person's input in its own state; another plan or version starts afresh.
          key={`${plan.id}:${versionId ?? ""}`}
          plan={plan}
          workspaceId={workspaceId}
          ideaId={ideaId}
        />
      )}
    </QueryBoundary>
  );
}
