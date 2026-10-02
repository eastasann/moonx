import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NotFoundState } from "../../../components/states";
import { AI_KINDS } from "../../../lib/ai-exchange";
import { ExportForAi } from "../../../screens/ai/ExportForAi";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ai/export")({
  staticData: { crumb: "ai:export.title" },
  validateSearch: z.object({
    source: z.enum(AI_KINDS).optional().catch(undefined),
    id: z.uuid().optional().catch(undefined),
    scope: z.string().max(200).optional().catch(undefined),
  }),
  component: ExportRoute,
});

function ExportRoute() {
  const { workspaceId } = Route.useParams();
  const { source, id, scope } = Route.useSearch();
  if (!source) return <NotFoundState />;
  return <ExportForAi workspaceId={workspaceId} source={source} id={id} scope={scope} />;
}
