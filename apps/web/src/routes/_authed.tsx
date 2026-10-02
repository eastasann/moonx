import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { loadMe, safeNext } from "../lib/session";

export const Route = createFileRoute("/_authed")({
  // Every signed-in screen sits under this guard. No session sends the person to the login screen
  // with the page they asked for in `?next=` (design-spec 5, "authentication").
  beforeLoad: async ({ context, location }) => {
    const me = await loadMe(context.queryClient);
    if (!me) {
      const next = safeNext(`${location.pathname}${location.searchStr}`, "/");
      throw redirect({ to: "/login", search: next === "/" ? {} : { next } });
    }
  },
  component: Outlet,
});
