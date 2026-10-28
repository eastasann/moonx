import { economicsFieldSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  EconomicsScreen,
  type EconomicsSearch,
  EconomicsSkeleton,
} from "../../../../../../screens/Economics";

/**
 * `/w/$workspaceId/ideas/$ideaId/economics`: 18 Unit Economics & Scenarios (SDD 4章).
 * Values it cannot read are left out.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/economics",
)({
  validateSearch: (search: Record<string, unknown>): EconomicsSearch => ({
    field: economicsFieldSchema.safeParse(search.field).data,
    q: search.q === "V.08.WORTH" ? search.q : undefined,
  }),
  staticData: { skeleton: EconomicsSkeleton },
  component: EconomicsRoute,
});

function EconomicsRoute() {
  const { ideaId } = Route.useParams();
  const { modal, about, ...search } = Route.useSearch();
  return (
    <EconomicsScreen
      ideaId={ideaId}
      search={search}
      modal={modal}
      about={about}
    />
  );
}
