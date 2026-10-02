import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { selfAnalysisSectionQuery } from "../../../lib/self-analysis";
import { SelfAnalysisForm } from "../../../screens/SelfAnalysisForm";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/self-analysis/$sectionKey")({
  // The trail names the section as the form's heading does, and the template owns that title. A
  // failed read leaves the key in the trail: the form reads the section again and reports it.
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(selfAnalysisSectionQuery(params.sectionKey))
      .catch(() => null),
  staticData: {
    crumb: ({ params, loaderData }) =>
      (loaderData as { section: { title: string } } | null)?.section.title ??
      params.sectionKey ??
      "",
  },
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  component: SelfAnalysisFormRoute,
});

function SelfAnalysisFormRoute() {
  const { workspaceId, sectionKey } = Route.useParams();
  const { q } = Route.useSearch();
  return <SelfAnalysisForm workspaceId={workspaceId} sectionKey={sectionKey} focusQuestion={q} />;
}
