import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
  plugins: [vanillaExtractPlugin(), tanstackStart({ spa: { enabled: true } }), viteReact()],
});
