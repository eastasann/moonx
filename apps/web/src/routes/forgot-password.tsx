import { createFileRoute } from "@tanstack/react-router";
import { ForgotPassword } from "../screens/ForgotPassword";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPassword });
