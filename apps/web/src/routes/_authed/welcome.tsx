import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Welcome } from "../../screens/Welcome";

export const Route = createFileRoute("/_authed/welcome")({
  validateSearch: z.object({
    step: z.enum(["invite", "profile", "done"]).optional().catch(undefined),
    token: z.string().optional().catch(undefined),
  }),
  component: WelcomeRoute,
});

function WelcomeRoute() {
  const { step, token } = Route.useSearch();
  return <Welcome step={step} token={token} />;
}
