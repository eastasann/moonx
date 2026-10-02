import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { planHomeQuery } from "../../../lib/plans";

/**
 * Everything under one plan. The plan's name is the breadcrumb, read from the home's query the
 * same way the idea route reads the idea's name: the loader does not wait for it, so each screen
 * shows its own skeleton (design-spec 6.0.6) and the crumb falls back until the name arrives.
 */
export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/plans/$planId")({
  loader: ({ context, params }) => {
    const query = planHomeQuery(params.planId);
    void context.queryClient.prefetchQuery(query);
    return { name: context.queryClient.getQueryData(query.queryKey)?.name ?? null };
  },
  staticData: {
    crumb: ({ t, loaderData }) =>
      (loaderData as { name: string | null } | undefined)?.name ?? t("plan:crumbFallback"),
  },
  component: PlanRoute,
});

function PlanRoute() {
  const { planId } = Route.useParams();
  const { name } = Route.useLoaderData();
  const router = useRouter();
  const loaded = useQuery(planHomeQuery(planId)).data?.name ?? null;
  // The breadcrumb is computed from loader data, so a name that arrives or changes after the
  // loader ran needs the loader to run again.
  useEffect(() => {
    if (loaded !== null && loaded !== name) void router.invalidate();
  }, [loaded, name, router]);
  return <Outlet />;
}
