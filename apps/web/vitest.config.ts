import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: the TanStack Start plugin builds the whole app and is
// not needed to render routes under test.
export default defineConfig({
  plugins: [viteReact(), vanillaExtractPlugin()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    // SDD 10章: the Web's parts at 60% of lines or more, each of them, when a run is
    // given --coverage. Left out: the tests' own helpers, the generated route tree, and
    // the two entries happy-dom cannot run (client.tsx mounts the document, sw.ts is the
    // service worker), which the E2E covers.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/routeTree.gen.ts",
        "src/client.tsx",
        "src/sw.ts",
      ],
      thresholds: { lines: 60, perFile: true },
    },
  },
});
