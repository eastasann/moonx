import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { readWebEnv } from "./lib/env";
import { registerServiceWorker } from "./lib/pwa";
import { startSentry } from "./lib/sentry";

// TanStack Start's own client entry, with Sentry started before anything renders, so a
// failure of the first render is reported too (SDD 11章).
startSentry(readWebEnv(document));

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});

// The production build only: Vite's dev server serves no /sw.js (ADR-031). After the
// page's load, so the worker's install does not compete with the first screen.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void registerServiceWorker(), {
    once: true,
  });
}
