import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The condition is a build-time constant: in a production build Vite folds it to `null` and the
// dynamic import, with everything behind it, is dropped from the output.
const ComponentGallery = import.meta.env.DEV ? lazy(() => import("@moonx/ui-web/preview")) : null;

export const Route = createFileRoute("/dev/components")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DevComponents,
});

function DevComponents() {
  if (!ComponentGallery) return null;
  return (
    <Suspense fallback={null}>
      <ComponentGallery />
    </Suspense>
  );
}
