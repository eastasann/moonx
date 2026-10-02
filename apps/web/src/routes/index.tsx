import { createFileRoute, redirect } from "@tanstack/react-router";
import { homePath, loadMe } from "../lib/session";
import { Landing } from "../screens/Landing";

export const Route = createFileRoute("/")({
  // A signed-in person opening the landing page goes to their workspace (design-spec 5). The
  // prerender runs on the server with no session, so the check is for the browser only.
  beforeLoad: async ({ context }) => {
    if (typeof window === "undefined") return;
    const me = await loadMe(context.queryClient);
    if (me) throw redirect({ href: homePath(me) });
  },
  component: Landing,
});
