import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // One .env at the repository root serves the API and the Web (SDD 2章「環境変数」).
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  define: {
    // The Sentry release; make build-web passes the commit SHA. The only build-time value,
    // so one build serves staging and production (ADR-004).
    "import.meta.env.MOONX_RELEASE": JSON.stringify(
      process.env.MOONX_RELEASE || "dev",
    ),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // PORT is the API's port. Vite does not load .env for its config, so the value comes
      // from the Makefile (which exports the root .env) or from the e2e server's env, and the
      // e2e pair (API 3100, Web 5273) lines up like the development one (SDD 2章「環境変数」).
      // A regex, since a plain "/api" key is a prefix match that would also send paths
      // such as /apix to the API, which ADR-004 serves as screens.
      "^/api/": `http://localhost:${process.env.PORT || "3000"}`,
    },
  },
  plugins: [
    {
      // The @fontsource stylesheets list a woff fallback after each woff2. Every browser
      // the app supports reads woff2, and ADR-018 serves woff2 only, so the fallback is
      // cut before Vite resolves the URLs and the woff files never reach the build.
      name: "moonx-woff2-only",
      enforce: "pre",
      transform(code, id) {
        if (!/[\\/]@fontsource[\\/].+\.css$/.test(id)) return;
        return code.replace(
          /,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g,
          "",
        );
      },
    },
    tanstackStart({
      // The shell of every other screen (_shell.html, ADR-004) is rendered at /login, so
      // that / can be built into 1's own HTML (ADR-002): two pages of one path would be
      // rendered once. Only the root route renders into the shell, whatever the path.
      spa: { enabled: true, maskPath: "/login" },
      pages: [{ path: "/", prerender: { enabled: true, crawlLinks: false } }],
      // Tests sit next to the routes they cover without becoming routes themselves.
      router: { routeFileIgnorePattern: "\\.test\\.tsx?$" },
    }),
    viteReact(),
    vanillaExtractPlugin(),
  ],
});
