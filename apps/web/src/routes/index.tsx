import { i18n } from "@moonx/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { LandingScreen } from "../screens/Landing";

/**
 * `/`: 1 Landing (SDD 4章), built into `index.html` at build time (vite.config.ts), so its
 * title is in the route's head rather than set once the page runs.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: i18n.t("app:documentTitle", { page: i18n.t("landing:title") }) },
    ],
  }),
  component: LandingScreen,
});
