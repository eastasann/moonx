import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordScreen } from "../screens/ResetPassword";

/** `/reset-password?token=`: 2, the new password from the mail's link (SDD 4章). */
export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token:
      typeof search.token === "string" && search.token !== ""
        ? search.token
        : undefined,
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  return <ResetPasswordScreen token={token} />;
}
