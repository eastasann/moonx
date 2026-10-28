import {
  ideaDecisionFilterSchema,
  ideaSortSchema,
  stageSchema,
  uuidSchema,
} from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  IdeasScreen,
  type IdeasSearch,
  IdeasSkeleton,
  searchSchema,
} from "../../../../../screens/Ideas";

/** `/w/$workspaceId/ideas`: 6 Ideas (SDD 4章). Values it cannot read are left out. */
export const Route = createFileRoute("/_signedIn/w/$workspaceId/ideas/")({
  validateSearch: (search: Record<string, unknown>): IdeasSearch => ({
    stage: stageSchema.safeParse(search.stage).data,
    decision: ideaDecisionFilterSchema.safeParse(search.decision).data,
    proposer: uuidSchema.safeParse(search.proposer).data,
    archived:
      search.archived === true || search.archived === "true" ? true : undefined,
    sort: ideaSortSchema.safeParse(search.sort).data,
    q:
      typeof search.q === "string" &&
      search.q !== "" &&
      searchSchema.safeParse(search.q).success
        ? search.q
        : undefined,
    selected: uuidSchema.safeParse(search.selected).data,
  }),
  staticData: { skeleton: IdeasSkeleton },
  component: IdeasRoute,
});

function IdeasRoute() {
  const { modal, ...search } = Route.useSearch();
  return <IdeasScreen search={search} modal={modal} />;
}
