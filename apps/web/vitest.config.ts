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
  },
});
