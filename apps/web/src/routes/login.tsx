import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen, type LoginSearch } from "../screens/Login";

const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * `/login`: 2 Log in (SDD 4章). The shell of every other screen is rendered at this path
 * when the app is built (vite.config.ts `spa.maskPath`), so it sets no head of its own.
 */
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: text(search.next),
    error: text(search.error),
    requestId: text(search.requestId),
  }),
  component: Login,
});

function Login() {
  const search = Route.useSearch();
  return <LoginScreen {...search} />;
}
