import { economicsFieldSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Economics } from "../../../screens/Economics";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/economics")({
  staticData: { crumb: ({ t }) => t("validation:sections.06-08") },
  validateSearch: z.object({ field: economicsFieldSchema.optional().catch(undefined) }),
  component: EconomicsRoute,
});

function EconomicsRoute() {
  const { workspaceId, ideaId } = Route.useParams();
  const { field } = Route.useSearch();
  return <Economics workspaceId={workspaceId} ideaId={ideaId} field={field} />;
}
