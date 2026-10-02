import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Questions } from "../../../screens/Questions";

export const Route = createFileRoute(
  "/_authed/_frame/w/$workspaceId/ideas/$ideaId/questions/$sectionKey",
)({
  staticData: { crumb: ({ t, params }) => t(`validation:sections.${params.sectionKey}`) },
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  component: QuestionsRoute,
});

function QuestionsRoute() {
  const { workspaceId, ideaId, sectionKey } = Route.useParams();
  const { q } = Route.useSearch();
  return (
    <Questions
      workspaceId={workspaceId}
      ideaId={ideaId}
      sectionKey={sectionKey}
      focusQuestion={q}
    />
  );
}
