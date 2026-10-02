import { costCategorySchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Costs } from "../../../screens/Costs";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/costs")({
  staticData: { crumb: ({ t }) => t("validation:sections.05") },
  validateSearch: z.object({
    tab: costCategorySchema.optional().catch(undefined),
    row: z.string().optional().catch(undefined),
  }),
  component: CostsRoute,
});

function CostsRoute() {
  const { workspaceId, ideaId } = Route.useParams();
  const { tab, row } = Route.useSearch();
  return <Costs workspaceId={workspaceId} ideaId={ideaId} tab={tab} row={row} />;
}
