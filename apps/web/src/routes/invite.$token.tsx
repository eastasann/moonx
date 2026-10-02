import { createFileRoute, redirect } from "@tanstack/react-router";
import { welcomeInvitePath } from "../lib/invitation";
import { loadMe } from "../lib/session";
import { Invite } from "../screens/Invite";

export const Route = createFileRoute("/invite/$token")({
  // Someone who is signed in only needs to accept: step 1 of the welcome flow (design-spec 6.16).
  beforeLoad: async ({ context, params }) => {
    const me = await loadMe(context.queryClient);
    if (me) throw redirect({ href: welcomeInvitePath(params.token) });
  },
  component: InviteRoute,
});

function InviteRoute() {
  const { token } = Route.useParams();
  return <Invite token={token} />;
}
