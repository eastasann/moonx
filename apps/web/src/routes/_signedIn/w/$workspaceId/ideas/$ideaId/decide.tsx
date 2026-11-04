import { createFileRoute } from "@tanstack/react-router";
import { DecisionScreen } from "../../../../../../screens/Decision";
import { DecisionSkeleton } from "../../../../../../screens/DecisionSkeleton";

/** `/w/$workspaceId/ideas/$ideaId/decide`: 19 Decision (SDD 4章). */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/decide",
)({
  staticData: { skeleton: DecisionSkeleton },
  component: DecisionRoute,
});

function DecisionRoute() {
  const { ideaId } = Route.useParams();
  return <DecisionScreen ideaId={ideaId} />;
}
