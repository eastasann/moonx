import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordScreen } from "../screens/ForgotPassword";

/** `/forgot-password`: 2, the password reset mail (SDD 4章). */
export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordScreen,
});
