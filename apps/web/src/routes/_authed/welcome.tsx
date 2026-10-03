import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Welcome } from "../../screens/Welcome";

export const Route = createFileRoute("/_authed/welcome")({
  validateSearch: z.object({
    step: z.enum(["invite", "profile", "done"]).optional().catch(undefined),
    token: z.string().optional().catch(undefined),
    // The router parses `new=1` into the number 1.
    new: z
      .union([z.literal(1), z.literal("1")])
      .optional()
      .catch(undefined),
  }),
  component: WelcomeRoute,
});

function WelcomeRoute() {
  const { step, token, new: isNew } = Route.useSearch();
  return <Welcome step={step} token={token} isNewAccount={isNew !== undefined} />;
}
