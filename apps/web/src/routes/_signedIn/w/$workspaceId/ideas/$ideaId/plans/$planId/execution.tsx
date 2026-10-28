import { EXECUTION_STATUSES, uuidSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { isExecutionTab } from "../../../../../../../../lib/links";
import {
  ExecutionScreen,
  type ExecutionSearch,
  ExecutionSkeleton,
} from "../../../../../../../../screens/Execution";

/**
 * `/w/$workspaceId/ideas/$ideaId/plans/$planId/execution`: 22 Execution (SDD 4章). Values
 * it cannot read are left out: an `assignee` that is no `me` or id, a `status` no Next
 * Action has.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/plans/$planId/execution",
)({
  validateSearch: (search: Record<string, unknown>): ExecutionSearch => ({
    tab: isExecutionTab(search.tab) ? search.tab : undefined,
    item: uuidSchema.safeParse(search.item).data,
    assignee:
      search.assignee === "me"
        ? "me"
        : uuidSchema.safeParse(search.assignee).data,
    status: EXECUTION_STATUSES.next_action.find(
      (status) => status === search.status,
    ),
  }),
  staticData: { skeleton: ExecutionSkeleton },
  component: ExecutionRoute,
});

function ExecutionRoute() {
  const { ideaId, planId } = Route.useParams();
  const { modal: _, about: __, ...search } = Route.useSearch();
  return <ExecutionScreen ideaId={ideaId} planId={planId} search={search} />;
}
