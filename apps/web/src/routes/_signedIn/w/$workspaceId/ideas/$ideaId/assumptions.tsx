import { uuidSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { isAssumptionsTab } from "../../../../../../lib/links";
import {
  AssumptionsScreen,
  type AssumptionsSearch,
  AssumptionsSkeleton,
} from "../../../../../../screens/AssumptionsRisks";

/**
 * `/w/$workspaceId/ideas/$ideaId/assumptions`: 16 Assumptions & Risks (SDD 4章). Values it
 * cannot read are left out.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/assumptions",
)({
  validateSearch: (search: Record<string, unknown>): AssumptionsSearch => ({
    tab: isAssumptionsTab(search.tab) ? search.tab : undefined,
    row: uuidSchema.safeParse(search.row).data,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
  }),
  staticData: { skeleton: AssumptionsSkeleton },
  component: AssumptionsRoute,
});

function AssumptionsRoute() {
  const { ideaId } = Route.useParams();
  const { modal, about, ...search } = Route.useSearch();
  return (
    <AssumptionsScreen
      ideaId={ideaId}
      search={search}
      modal={modal}
      about={about}
    />
  );
}
