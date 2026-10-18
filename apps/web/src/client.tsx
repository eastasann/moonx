import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { readWebEnv } from "./lib/env";
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
