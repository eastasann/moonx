import { isQuestionKey, uuidSchema } from "@moonx/schemas";
import { compareViews } from "@moonx/ui-tokens";
import { createFileRoute } from "@tanstack/react-router";
import {
  CompetitorsScreen,
  type CompetitorsSearch,
  CompetitorsSkeleton,
} from "../../../../../../screens/Competitors";

/** The two pattern questions 15 asks (design-spec 6.10). */
const isPatternKey = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith("V.04.") &&
  isQuestionKey(value, "validation");

/**
 * `/w/$workspaceId/ideas/$ideaId/competitors`: 15 Competitors (SDD 4章). Values it cannot
 * read are left out.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/competitors",
)({
  validateSearch: (search: Record<string, unknown>): CompetitorsSearch => ({
    view: compareViews.find((view) => view === search.view),
    q: isPatternKey(search.q) ? search.q : undefined,
    row: uuidSchema.safeParse(search.row).data,
  }),
  staticData: { skeleton: CompetitorsSkeleton },
  component: CompetitorsRoute,
});

function CompetitorsRoute() {
  const { ideaId } = Route.useParams();
  const { modal, about, ...search } = Route.useSearch();
  return (
    <CompetitorsScreen
      ideaId={ideaId}
      search={search}
      modal={modal}
      about={about}
    />
  );
}
