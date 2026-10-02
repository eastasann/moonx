import { createFileRoute } from "@tanstack/react-router";
import { ValidationHome } from "../../../screens/validation-home/ValidationHome";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/")({
  component: ValidationHomeRoute,
});

function ValidationHomeRoute() {
  const { workspaceId, ideaId } = Route.useParams();
  return <ValidationHome workspaceId={workspaceId} ideaId={ideaId} />;
}
