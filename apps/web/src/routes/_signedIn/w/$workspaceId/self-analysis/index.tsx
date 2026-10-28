import { createFileRoute } from "@tanstack/react-router";
import {
  SelfAnalysisHomeScreen,
  SelfAnalysisHomeSkeleton,
} from "../../../../../screens/SelfAnalysisHome";

/** `/w/$workspaceId/self-analysis`: 10 Self Analysis (SDD 4章). */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/self-analysis/",
)({
  staticData: { skeleton: SelfAnalysisHomeSkeleton },
  component: SelfAnalysisHomeRoute,
});

function SelfAnalysisHomeRoute() {
  const { modal, about } = Route.useSearch();
  return <SelfAnalysisHomeScreen modal={modal} about={about} />;
}
