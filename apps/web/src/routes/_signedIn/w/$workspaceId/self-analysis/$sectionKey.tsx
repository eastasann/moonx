import { isQuestionKey } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { QuestionFormSkeleton } from "../../../../../screens/QuestionForm";
import {
  SelfAnalysisFormScreen,
  type SelfAnalysisFormSearch,
} from "../../../../../screens/SelfAnalysisForm";

/**
 * `/w/$workspaceId/self-analysis/$sectionKey`: 11 Question form for a self-analysis
 * section (SDD 4章). A `q` that is no self-analysis question ID (design-spec 6.6) is
 * left out.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/self-analysis/$sectionKey",
)({
  validateSearch: (
    search: Record<string, unknown>,
  ): SelfAnalysisFormSearch => ({
    q:
      typeof search.q === "string" && isQuestionKey(search.q, "self_analysis")
        ? search.q
        : undefined,
  }),
  staticData: { skeleton: QuestionFormSkeleton },
  component: SelfAnalysisFormRoute,
});

function SelfAnalysisFormRoute() {
  const { sectionKey } = Route.useParams();
  const { q } = Route.useSearch();
  return <SelfAnalysisFormScreen sectionKey={sectionKey} search={{ q }} />;
}
