import { createFileRoute } from "@tanstack/react-router";
import { InviteScreen } from "../screens/SignUp";

/** `/invite/$token`: the invitation's link, to 2's sign-up or 3's ① (SDD 4章). */
export const Route = createFileRoute("/invite/$token")({
  component: Invite,
});

function Invite() {
  const { token } = Route.useParams();
  // A new invitation is a new screen, its form empty.
  return <InviteScreen key={token} token={token} />;
}
