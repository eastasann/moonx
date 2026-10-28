import {
  assigneeNameSchema,
  EXECUTION_STATUSES,
  uuidSchema,
} from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { isExecutionTab } from "../../../../../../../../lib/links";
import {
  ExecutionScreen,
  type ExecutionSearch,
  ExecutionSkeleton,
} from "../../../../../../../../screens/Execution";

/**
 * `/w/$workspaceId/ideas/$ideaId/plans/$planId/execution`: 22 Execution (SDD 4章). Values
 * it cannot read are left out: an `assignee` that is no `me` or id, an `assigneeName` that
 * no assignee could be typed as or that comes with an `assignee`, a `status` no Next Action
 * has.
 */
/**
 * A search value as the text it was in the URL: the router reads a value that looks like
 * JSON as JSON, so a name typed as "123" or "true" comes back as a number or a boolean.
 */
const searchText = (value: unknown) =>
  typeof value === "number" || typeof value === "boolean" || value === null
    ? String(value)
    : value;

export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/plans/$planId/execution",
)({
  validateSearch: (search: Record<string, unknown>): ExecutionSearch => {
    const assignee =
      search.assignee === "me"
        ? "me"
        : uuidSchema.safeParse(search.assignee).data;
    return {
      tab: isExecutionTab(search.tab) ? search.tab : undefined,
      item: uuidSchema.safeParse(search.item).data,
      assignee,
      assigneeName:
        assignee === undefined
          ? (assigneeNameSchema.safeParse(searchText(search.assigneeName))
              .data ?? undefined)
          : undefined,
      status: EXECUTION_STATUSES.next_action.find(
        (status) => status === search.status,
      ),
    };
  },
  staticData: { skeleton: ExecutionSkeleton },
  component: ExecutionRoute,
});

function ExecutionRoute() {
  const { ideaId, planId } = Route.useParams();
  const { modal: _, about: __, ...search } = Route.useSearch();
  return <ExecutionScreen ideaId={ideaId} planId={planId} search={search} />;
}
