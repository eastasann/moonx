import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";

// The manifest and icons `make tokens` generates (ADR-031). The manifest is served at
// /manifest.webmanifest, every other file there under /icons/.
const GENERATED = fileURLToPath(
  new URL("../../packages/ui-tokens/src/generated/pwa", import.meta.url),
);
const MANIFEST = "manifest.webmanifest";

const servedPath = (file: string) =>
  file === MANIFEST ? `/${MANIFEST}` : `/icons/${file}`;

const CONTENT_TYPES: Record<string, string> = {
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const contentType = (file: string) =>
  CONTENT_TYPES[file.slice(file.lastIndexOf("."))] ??
  "application/octet-stream";

/** Where TanStack Start writes the Web's own files (its client build). */
const CLIENT_OUT_DIR = "dist/client";

const SERVICE_WORKER: Partial<VitePWAOptions> = {
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  outDir: CLIENT_OUT_DIR,
  // src/lib/pwa.ts registers the worker itself, and the manifest is make tokens'.
  injectRegister: false,
  manifest: false,
  injectManifest: {
    // The outside of the screens only (ADR-031): the shell, the built scripts and
    // styles, the fonts and the icons. The landing (index.html) and the other HTML pages
    // stay out. The Japanese fonts are listed too, so that src/sw.ts knows the current
    // ones, but it caches them only when a page uses them.
    globPatterns: [
      "_shell.html",
      "assets/*.{js,css}",
      "assets/ibm-plex-{sans,mono}-*.woff2",
      "icons/*",
    ],
    // Vite puts a hash in every file name under assets/, so those need no revision.
    dontCacheBustURLsMatching: /^assets\//,
    // A classic script: the worker is registered without `type: "module"`.
    rollupFormat: "iife",
    // TanStack Start sets minify per environment, which the worker's build does not read.
    minify: true,
  },
};

// An inline script element that runs: no `src`, and no `type` other than a script's (a
// data block such as type="application/json" is no script and is left as it is). Its
// attributes, and its code.
const INLINE_SCRIPT =
  /<script((?:(?!\bsrc=|\btype="(?!module"|text\/javascript")[^"]*")[^>])*)>([\s\S]*?)<\/script>/g;

/**
 * Moves the scripts TanStack Start writes inline into the prerendered HTML (the scroll
 * restoration and the router's bootstrap) into files under assets/, loaded by `src` in
 * the same place. The CSP of SDD 7.2 allows only `script-src 'self'`, which stays so
 * because the Web runs no inline script (ADR-004). A classic script with `src` runs at
 * the same point of the parse as the inline one did, and `document.currentScript` is
 * the same element.
 */
async function externalizeInlineScripts(outDir: string) {
  const names = await readdir(outDir, { recursive: true });
  for (const name of names.filter((file) => file.endsWith(".html"))) {
    const path = join(outDir, name);
    const html = await readFile(path, "utf8");
    const scripts: { file: string; code: string }[] = [];
    const rewritten = html.replace(
      INLINE_SCRIPT,
      (element, attributes: string, code: string) => {
        if (code.trim() === "") return element;
        // Named like Vite's own assets, so the API serves them as immutable (ADR-004).
        const hash = createHash("sha256")
          .update(code)
          .digest("base64url")
          .slice(0, 8);
        const file = `assets/inline-${hash}.js`;
        scripts.push({ file, code });
        return `<script${attributes} src="/${file}"></script>`;
      },
    );
    for (const { file, code } of scripts) {
      await writeFile(join(outDir, file), code);
    }
    await writeFile(path, rewritten);
  }
}

// Zod's core module, which creates the config every schema reads as it is built.
const ZOD_CORE = /[\\/]zod[\\/]v4[\\/]core[\\/]core\.js$/;

/**
 * Runs Zod without compiling its parsers (`jitless`) in the browser's build. The CSP of
 * SDD 7.2 allows no eval: Zod would otherwise try `new Function` once, which the browser
 * refuses and reports as a violation, and then parse the same way. The setting goes at
 * the top of Zod's own core, since the shared schemas are built as their chunks load,
 * before any of the app's code could set it. The API, without a CSP, keeps compiling.
 */
function zodWithoutEval(): Plugin {
  let found = false;
  return {
    name: "moonx-zod-without-eval",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    transform(code, id) {
      if (!ZOD_CORE.test(id)) return;
      found = true;
      return `(globalThis.__zod_globalConfig ??= {}).jitless = true;\n${code}`;
    },
    buildEnd() {
      if (!found)
        this.error("Zod's core module was not found to run it without eval");
    },
  };
}

// A screen's own module, as against the skeleton module routes may name (PendingScreen.tsx).
const SCREEN = /[\\/]apps[\\/]web[\\/]src[\\/]screens[\\/](?!.*Skeleton\.tsx$)/;
// The route files, the only modules that may import a screen.
const ROUTE = /[\\/]apps[\\/]web[\\/]src[\\/]routes[\\/]/;

/**
 * SDD 7.3's per-route code splitting in the client build. The build fails if anything
 * but a route file imports a screen (opening one screen would load another's code: what
 * they share goes in components/ or lib/), or if a screen is among what the app's entry
 * loads before any route (a route file that imports one outside its `component` puts it
 * in every page's first load). Those entry files are its chunk, the chunks those import
 * statically, and their CSS, as the bundle has them (served paths without the leading
 * `/`).
 */
function routeSplitting() {
  let entryFiles: Set<string> | undefined;
  const plugin: Plugin = {
    name: "moonx-route-splitting",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    buildEnd() {
      let screens = 0;
      for (const id of this.getModuleIds()) {
        if (!SCREEN.test(id)) continue;
        screens += 1;
        const info = this.getModuleInfo(id);
        const others = [
          ...(info?.importers ?? []),
          ...(info?.dynamicImporters ?? []),
        ].filter((importer) => !ROUTE.test(importer));
        if (others.length > 0) {
          this.error(`${id} is imported by ${others.join(", ")}, not a route`);
        }
      }
      // A moved folder would leave both checks with nothing to check.
      if (screens === 0) this.error("The client build has no screen modules");
    },
    generateBundle(_, bundle) {
      const entries = Object.values(bundle).filter(
        (output) => output.type === "chunk" && output.isEntry,
      );
      if (entries.length !== 1) {
        this.error(`The client build has ${entries.length} entries, not 1`);
      }
      const files = new Set<string>();
      const visit = (fileName: string) => {
        const chunk = bundle[fileName];
        if (files.has(fileName) || chunk?.type !== "chunk") return;
        files.add(fileName);
        const screens = chunk.moduleIds.filter((id) => SCREEN.test(id));
        if (screens.length > 0) {
          this.error(
            `The entry loads the screens ${screens.join(", ")} (${fileName}): ` +
              "a route may import only its skeleton module outside its component",
          );
        }
        for (const css of chunk.viteMetadata?.importedCss ?? []) files.add(css);
        chunk.imports.forEach(visit);
      };
      visit(entries[0]?.fileName ?? "");
      entryFiles = files;
    },
  };
  /**
   * Leaves in `_shell.html` only the preloads and styles of the entry. The shell is
   * prerendered at /login (`spa.maskPath`), which adds that route's chunks; every other
   * screen opens on the same shell and must not load them (SDD 7.3). Each route loads
   * its own chunks, with their CSS, when it opens.
   */
  async function trimShell(outDir: string) {
    if (entryFiles === undefined) {
      throw new Error("The client build's entry files were not recorded");
    }
    const kept = entryFiles;
    const path = join(outDir, "_shell.html");
    const html = (await readFile(path, "utf8")).replace(
      SHELL_LINK,
      (link, _rel, file: string) => (kept.has(file) ? link : ""),
    );
    // Every preload and stylesheet left is one of the entry's: a link written another
    // way would be neither matched nor dropped.
    const left = [...html.matchAll(SHELL_LINK)].length;
    const rels = html.match(/rel="(modulepreload|stylesheet)"/g)?.length ?? 0;
    if (left === 0 || left !== rels) {
      throw new Error(
        `_shell.html keeps ${rels} links, ${left} of the entry's`,
      );
    }
    await writeFile(path, html);
  }
  return { plugin, trimShell };
}

// A preload or stylesheet link TanStack Start writes into the shell, and its file.
const SHELL_LINK =
  /<link rel="(modulepreload|stylesheet)" href="\/([^"]+)"[^>]*>/g;

/**
 * The PWA of ADR-031 in the Web's build: the manifest and icons from
 * `packages/ui-tokens`, and the service worker (`src/sw.ts`) with the list of the built
 * files injected by vite-plugin-pwa's `injectManifest`. The dev server serves the
 * manifest and icons only; the worker is never registered there (src/lib/pwa.ts).
 *
 * @param trimShell Rewrites the prerendered `_shell.html` before the worker lists it.
 */
function pwa(trimShell: (outDir: string) => Promise<void>): Plugin[] {
  const plugins = VitePWA(SERVICE_WORKER);
  // vite-plugin-pwa builds the worker when each environment's bundle closes, which in
  // TanStack Start is before the prerender writes _shell.html. Only its main plugin is
  // kept, for its API, and the worker is built below once the prerender is done.
  const main = plugins.find((plugin) => plugin.name === "vite-plugin-pwa");
  const api = main?.api as { generateSW(): Promise<void> } | undefined;
  if (main === undefined || api === undefined) {
    throw new Error("vite-plugin-pwa no longer has its main plugin and API");
  }
  return [
    main,
    {
      name: "moonx-pwa",
      async configureServer(server) {
        const files = new Map(
          (await readdir(GENERATED)).map((file) => [servedPath(file), file]),
        );
        server.middlewares.use((request, response, next) => {
          const file = files.get(request.url?.split("?")[0] ?? "");
          if (file === undefined) return next();
          response.setHeader("content-type", contentType(file));
          createReadStream(join(GENERATED, file)).pipe(response);
        });
      },
      // After TanStack Start's post-build (the prerender of / and _shell.html), whose
      // plugin comes before this one. The service worker lists the files as they end.
      enforce: "post",
      buildApp: {
        order: "post",
        async handler(builder) {
          const client = builder.environments.client?.config;
          const outDir =
            client === undefined
              ? undefined
              : resolve(client.root, client.build.outDir);
          if (outDir !== resolve(builder.config.root, CLIENT_OUT_DIR)) {
            throw new Error(
              `The client build went to ${outDir}, not ${CLIENT_OUT_DIR}`,
            );
          }
          await mkdir(join(outDir, "icons"), { recursive: true });
          for (const file of await readdir(GENERATED)) {
            await copyFile(
              join(GENERATED, file),
              join(outDir, servedPath(file)),
            );
          }
          // The plugin order puts the prerender first; the worker must list its shell.
          await access(join(outDir, "_shell.html"));
          await externalizeInlineScripts(outDir);
          await trimShell(outDir);
          await api.generateSW();
        },
      },
    },
  ];
}

const shell = routeSplitting();

export default defineConfig({
  // One .env at the repository root serves the API and the Web (SDD 2章「環境変数」).
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  build: {
    // Source maps for Sentry only (SDD 11章「Web のエラー」): no file names its map, and
    // make build-api-image uploads them and leaves them out of the image, so the served
    // files never expose the source.
    sourcemap: "hidden",
    // A font never becomes a data: URL, which the CSP's font-src 'self' refuses (SDD 7.2):
    // each stays its own woff2 (ADR-018). Other assets keep Vite's default.
    assetsInlineLimit: (file) => (file.endsWith(".woff2") ? false : undefined),
  },
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
      // rendered once. Only the root route renders into the shell, whatever the path, and
      // routeSplitting() takes the links to /login's own chunks back out.
      spa: { enabled: true, maskPath: "/login" },
      pages: [{ path: "/", prerender: { enabled: true, crawlLinks: false } }],
      // Tests sit next to the routes they cover without becoming routes themselves.
      router: { routeFileIgnorePattern: "\\.test\\.tsx?$" },
    }),
    viteReact(),
    vanillaExtractPlugin(),
    zodWithoutEval(),
    shell.plugin,
    // After tanstackStart: the service worker lists the shell its prerender writes.
    pwa(shell.trimShell),
  ],
});
