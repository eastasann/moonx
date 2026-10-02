import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NotFoundState } from "../../../components/states";
import { AI_KINDS, safeReturnTo } from "../../../lib/ai-exchange";
import { ImportFromAi } from "../../../screens/ai/ImportFromAi";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ai/import")({
  staticData: { crumb: "ai:import.title" },
  validateSearch: z.object({
    target: z.enum(AI_KINDS).optional().catch(undefined),
    id: z.uuid().optional().catch(undefined),
    scope: z.string().max(200).optional().catch(undefined),
    returnTo: z
      .string()
      .max(500)
      .optional()
      .catch(undefined)
      .transform((value) => safeReturnTo(value)),
  }),
  component: ImportRoute,
});

function ImportRoute() {
  const { workspaceId } = Route.useParams();
  const { target, id, scope, returnTo } = Route.useSearch();
  if (!target) return <NotFoundState />;
  return (
    <ImportFromAi
      workspaceId={workspaceId}
      target={target}
      id={id}
      scope={scope}
      returnTo={returnTo}
    />
  );
}
