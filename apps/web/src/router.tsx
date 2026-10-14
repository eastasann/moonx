import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Creates the router; TanStack Start calls this once per page load. */
export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
