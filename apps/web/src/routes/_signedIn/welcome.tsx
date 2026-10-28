import { createFileRoute } from "@tanstack/react-router";
import {
  WelcomeScreen,
  type WelcomeSearch,
  WelcomeSkeleton,
  type WelcomeStep,
} from "../../screens/Welcome";

const STEPS: readonly WelcomeStep[] = ["invite", "profile", "done"];

/** `/welcome?step=&token=&new=1`: 3 Welcome (SDD 4章), which needs a session. */
export const Route = createFileRoute("/_signedIn/welcome")({
  validateSearch: (search: Record<string, unknown>): WelcomeSearch => ({
    step: STEPS.find((step) => step === search.step),
    token:
      typeof search.token === "string" && search.token !== ""
        ? search.token
        : undefined,
    // `new=1`, which the router reads as the number 1 and writes back as it is kept.
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
  }),
  staticData: { skeleton: WelcomeSkeleton, isStandalone: true },
  component: Welcome,
});

function Welcome() {
  const search = Route.useSearch();
  return <WelcomeScreen {...search} />;
}
