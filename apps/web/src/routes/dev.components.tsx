import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// import.meta.env.DEV is a build-time constant: a production build folds it to false and
// drops the dynamic import, so the gallery never reaches the bundle (SDD 4章).
const ComponentGallery = import.meta.env.DEV
  ? lazy(() => import("@moonx/ui-web/preview"))
  : null;

/**
 * `?screen=` draws one screen of docs/mockups alone across the window, `?theme=` in the
 * light or dark theme, to set beside the mockup (docs/03_dev-setup.md 3.3).
 */
interface GallerySearch {
  screen?: string;
  theme?: "light" | "dark";
}

export const Route = createFileRoute("/dev/components")({
  validateSearch: (search: Record<string, unknown>): GallerySearch => ({
    screen: typeof search.screen === "string" ? search.screen : undefined,
    theme:
      search.theme === "light" || search.theme === "dark"
        ? search.theme
        : undefined,
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  // The gallery shows its toasts in its own containers, in its own frames.
  staticData: { hasOwnToasts: true },
  component: DevComponents,
});

function DevComponents() {
  const { screen, theme } = Route.useSearch();
  if (!ComponentGallery) return null;
  return (
    <Suspense fallback={null}>
      <ComponentGallery screen={screen} theme={theme} />
    </Suspense>
  );
}
