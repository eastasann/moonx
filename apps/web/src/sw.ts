import { clientsClaim } from "workbox-core";
import {
  matchPrecache,
  type PrecacheEntry,
  precacheAndRoute,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { SKIP_WAITING } from "./lib/sw-messages";

// The service worker of ADR-031, served at /sw.js. It keeps the outside of the screens
// only: the shell, the built assets, the fonts and the icons. Nothing under /api/ has a
// route here, so those requests always go to the network, offline included.

declare const self: ServiceWorkerGlobalScope & {
  /** The built files, injected by vite-plugin-pwa (vite.config.ts). */
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

const SHELL = "/_shell.html";
const JAPANESE_FONTS_CACHE = "moonx-fonts-jp";

// One file per character range, over a hundred for each weight (ADR-018): installing
// them all would fetch what most pages never draw.
const isJapaneseFont = (url: string) =>
  /(^|\/)assets\/ibm-plex-sans-jp-[^/]*\.woff2$/.test(url);

/**
 * A path of a screen as ADR-004 tells them apart from files: not under /api/, and not
 * where the build puts files (under /assets/ or /icons/, or a name with an extension at
 * the top). The API answers these with the shell (apps/api/src/web.ts).
 */
const isScreenPath = (pathname: string) =>
  !pathname.startsWith("/api/") &&
  !pathname.startsWith("/assets/") &&
  !pathname.startsWith("/icons/") &&
  !/^\/[^/]*\.[^/]*$/.test(pathname);

const entries = self.__WB_MANIFEST.map((entry) =>
  typeof entry === "string" ? { url: entry, revision: null } : entry,
);
precacheAndRoute(entries.filter((entry) => !isJapaneseFont(entry.url)));

const japaneseFonts = new Set(
  entries
    .filter((entry) => isJapaneseFont(entry.url))
    .map((entry) => new URL(entry.url, self.location.href).href),
);
registerRoute(
  ({ url }) => japaneseFonts.has(url.href),
  new CacheFirst({ cacheName: JAPANESE_FONTS_CACHE }),
);

// The network first, so a screen opens on the HTML the API has just written its meta
// elements into (ADR-004); the cached shell only when the network cannot be reached.
registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" &&
    url.origin === self.location.origin &&
    isScreenPath(url.pathname),
  async ({ request }) => {
    try {
      return await fetch(request);
    } catch (error) {
      const shell = await matchPrecache(SHELL);
      if (shell === undefined) throw error;
      return shell;
    }
  },
);

self.addEventListener("activate", (event) => {
  // The fonts of earlier builds are never asked for again.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(JAPANESE_FONTS_CACHE);
      for (const request of await cache.keys()) {
        if (!japaneseFonts.has(request.url)) await cache.delete(request);
      }
    })(),
  );
});

// A new version waits until the user chooses Reload (ADR-031): never skipped on its own.
self.addEventListener("message", (event) => {
  if (event.data === SKIP_WAITING) void self.skipWaiting();
});

// The first install takes the open page at once, so the fonts it draws are kept from
// the start. An update takes the pages only once the user chose Reload, as above.
clientsClaim();
