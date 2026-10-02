import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { homePath, loadMe, safeNext } from "../lib/session";
import { Login } from "../screens/Login";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    next: z.string().optional().catch(undefined),
    error: z.string().optional().catch(undefined),
  }),
  beforeLoad: async ({ context, search }) => {
    const me = await loadMe(context.queryClient);
    if (me) throw redirect({ href: safeNext(search.next, homePath(me)) });
  },
  component: LoginRoute,
});

function LoginRoute() {
  const { next, error } = Route.useSearch();
  return <Login next={next} error={error} />;
}
