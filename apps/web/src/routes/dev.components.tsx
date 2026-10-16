import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// import.meta.env.DEV is a build-time constant: a production build folds it to false and
// drops the dynamic import, so the gallery never reaches the bundle (SDD 4章).
const ComponentGallery = import.meta.env.DEV
  ? lazy(() => import("@moonx/ui-web/preview"))
  : null;

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
