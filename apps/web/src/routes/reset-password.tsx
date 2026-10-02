import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ResetPassword } from "../screens/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { token } = Route.useSearch();
  return <ResetPassword token={token} />;
}
