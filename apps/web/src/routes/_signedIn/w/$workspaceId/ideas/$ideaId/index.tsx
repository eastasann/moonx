import { createFileRoute } from "@tanstack/react-router";
import { ValidationHomeScreen } from "../../../../../../screens/ValidationHome";
import { ValidationHomeSkeleton } from "../../../../../../screens/ValidationHomeSkeleton";

/** `/w/$workspaceId/ideas/$ideaId`: 13 Validation home (SDD 4章). */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/",
)({
  staticData: { skeleton: ValidationHomeSkeleton },
  component: ValidationHomeRoute,
});

function ValidationHomeRoute() {
  const { ideaId } = Route.useParams();
  const { modal, about } = Route.useSearch();
  return <ValidationHomeScreen ideaId={ideaId} modal={modal} about={about} />;
}
