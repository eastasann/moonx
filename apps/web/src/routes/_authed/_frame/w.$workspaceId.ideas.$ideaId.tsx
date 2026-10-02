import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { validationHomeQuery } from "../../../lib/validation-home";

/**
 * Everything under one idea. The idea's name is the breadcrumb, read from the home's query. The
 * loader does not wait for that read, so the screen shows its own skeleton (design-spec 6.0.6)
 * and the crumb falls back until the name arrives.
 */
export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId")({
  loader: ({ context, params }) => {
    const query = validationHomeQuery(params.ideaId);
    void context.queryClient.prefetchQuery(query);
    return { name: context.queryClient.getQueryData(query.queryKey)?.idea.name ?? null };
  },
  staticData: {
    crumb: ({ t, loaderData }) =>
      (loaderData as { name: string | null } | undefined)?.name ??
      t("validation:home.crumbFallback"),
  },
  component: IdeaRoute,
});

function IdeaRoute() {
  const { ideaId } = Route.useParams();
  const { name } = Route.useLoaderData();
  const router = useRouter();
  const loaded = useQuery(validationHomeQuery(ideaId)).data?.idea.name ?? null;
  // The breadcrumb is computed from loader data, so a name that arrives or changes after the
  // loader ran needs the loader to run again.
  useEffect(() => {
    if (loaded !== null && loaded !== name) void router.invalidate();
  }, [loaded, name, router]);
  return <Outlet />;
}
