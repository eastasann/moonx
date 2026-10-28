import { createFileRoute } from "@tanstack/react-router";
import {
  TeamSelfAnalysesScreen,
  TeamSelfAnalysesSkeleton,
} from "../../../../screens/TeamSelfAnalyses";

/**
 * `/w/$workspaceId/team` and `/w/$workspaceId/team/$userId`: 12 Team Self Analyses, with
 * the member chosen (SDD 4章). One route, so choosing another member keeps the screen.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/team/{-$userId}",
)({
  staticData: { skeleton: TeamSelfAnalysesSkeleton },
  component: TeamRoute,
});

function TeamRoute() {
  const { userId } = Route.useParams();
  return <TeamSelfAnalysesScreen userId={userId} />;
}
