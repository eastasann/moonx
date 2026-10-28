import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import type { Config } from "./config";
import { ApiError } from "./errors";

/** Thrown at startup when `WEB_DIST_DIR` holds no build of the Web, so the API does not start. */
export class WebBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebBuildError";
  }
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// The Cache-Control values of ADR-004 and ADR-031.
const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";
const ONE_DAY = "public, max-age=86400";

/**
 * Files the browser asks about each time (ADR-031): /sw.js so that a new version is found
 * at once, the manifest so that a changed name, colour or icon applies.
 */
const REVALIDATED = new Set(["/manifest.webmanifest", "/sw.js"]);

// Vite names what it builds into assets/ `{name}-{8-character hash}.{extension}`.
const HASHED_ASSET = /^\/assets\/.+-[\w-]{8}\.\w+$/;

const SHELL = "/_shell.html";
const LANDING = "/index.html";

interface WebFile {
  contentType: string;
  cacheControl: string;
  /** The HTML with the meta elements written in, or the file to stream. */
  body: string | { path: string };
}

const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/**
 * The meta elements of ADR-004, through which one build learns each environment's
 * values: the Web reads them in `src/lib/env.ts`.
 */
function metaElements(config: Pick<Config, "appEnv" | "webSentryDsn">) {
  return [
    ["moonx-app-env", config.appEnv],
    ["moonx-sentry-dsn", config.webSentryDsn ?? ""],
  ]
    .map(
      ([name, content]) =>
        `<meta name="${name}" content="${escapeAttribute(content ?? "")}">`,
    )
    .join("");
}

/**
 * A path of a screen as ADR-004 tells them apart from files: not under /api/, and not
 * where the build puts files (under /assets/ or /icons/, or a name with an extension at
 * the top, such as /sw.js). Deeper segments are screens' parameters, a template's section
 * key among them, which may hold a dot. The Web's service worker tells them apart the
 * same way (apps/web/src/sw.ts).
 */
const isScreenPath = (path: string) =>
  !path.startsWith("/api/") &&
  !path.startsWith("/assets/") &&
  !path.startsWith("/icons/") &&
  !/^\/[^/]*\.[^/]*$/.test(path);

/** The build as {@link webRoutes} serves it, read once at startup. */
interface Build {
  /** Every file by the path it is served at, the HTML carrying the meta elements. */
  files: Map<string, WebFile>;
  /**
   * The prerendered pages by their screen path (ADR-004): `/` the landing, and pages
   * such as 29 and 30, as `{path}/index.html` or `{path}.html`. Not the shell.
   */
  pages: Map<string, WebFile>;
  shell: WebFile;
}

const pagePath = (served: string) =>
  served === LANDING
    ? "/"
    : served.endsWith("/index.html")
      ? served.slice(0, -"/index.html".length)
      : served.slice(0, -".html".length);

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Reads the build in `directory`. Once, at startup: the image's build never changes
 * (ADR-016), and a request can only name a file listed here, never a path on the disk.
 *
 * @throws {WebBuildError} when the directory cannot be read, the shell or the landing is
 * missing, or an HTML file has no `</head>`.
 */
function readBuild(
  directory: string,
  config: Pick<Config, "appEnv" | "webSentryDsn">,
): Build {
  const meta = metaElements(config);
  const files = new Map<string, WebFile>();
  const pages = new Map<string, WebFile>();
  try {
    for (const name of readdirSync(directory, {
      recursive: true,
      encoding: "utf8",
    })) {
      const segments = name.split(sep);
      // Dot files (a .DS_Store, say) are no part of the build.
      if (segments.some((segment) => segment.startsWith("."))) continue;
      const path = join(directory, name);
      if (!statSync(path).isFile()) continue;
      const served = `/${segments.join("/")}`;
      const extension = extname(name);
      const contentType = CONTENT_TYPES[extension] ?? Bun.file(path).type;
      if (extension === ".html") {
        const html = readFileSync(path, "utf8");
        if (!html.includes("</head>")) {
          throw new WebBuildError(`${served} in WEB_DIST_DIR has no </head>`);
        }
        const file = {
          contentType,
          cacheControl: REVALIDATE,
          // A function, so that a `$` in a value is not read as a replacement pattern.
          body: html.replace("</head>", () => `${meta}</head>`),
        };
        files.set(served, file);
        if (served !== SHELL) pages.set(pagePath(served), file);
        continue;
      }
      files.set(served, {
        contentType,
        cacheControl: REVALIDATED.has(served)
          ? REVALIDATE
          : HASHED_ASSET.test(served)
            ? IMMUTABLE
            : ONE_DAY,
        body: { path },
      });
    }
  } catch (error) {
    if (error instanceof WebBuildError) throw error;
    throw new WebBuildError(
      `WEB_DIST_DIR (${directory}) cannot be read: ${messageOf(error)}`,
    );
  }
  const missing = (required: string) =>
    new WebBuildError(
      `WEB_DIST_DIR (${directory}) has no ${required}: run make build-web`,
    );
  const shell = files.get(SHELL);
  if (shell === undefined) throw missing(SHELL);
  if (!files.has(LANDING)) throw missing(LANDING);
  return { files, pages, shell };
}

/**
 * The Web, served from `WEB_DIST_DIR` at `/*` by the same service as the API (ADR-004):
 * the build's files as they are, the screens' paths with their page, and 404 for a file
 * that is not there. Content types and Cache-Control are those of ADR-004 and ADR-031;
 * the entry plugin adds the security headers of SDD 7.2 to every response.
 *
 * @throws {WebBuildError} when the directory holds no build of the Web.
 */
export function webRoutes(
  access: AccessPlugin,
  directory: string,
  config: Pick<Config, "appEnv" | "webSentryDsn">,
) {
  const { files, pages, shell } = readBuild(directory, config);
  return new Elysia().use(access).get(
    "/*",
    ({ path }) => {
      // An /api/ path no route took is the API's 404, not a screen.
      if (path.startsWith("/api/")) {
        throw new ApiError("NOT_FOUND", "No route matches the request");
      }
      // A screen opens on its prerendered page, or else on the SPA's shell.
      const file =
        files.get(path) ??
        (isScreenPath(path)
          ? (pages.get(path.replace(/(.)\/+$/, "$1")) ?? shell)
          : null);
      if (file === null) {
        throw new ApiError("NOT_FOUND", "No file matches the request");
      }
      return new Response(
        typeof file.body === "string" ? file.body : Bun.file(file.body.path),
        {
          headers: {
            "content-type": file.contentType,
            "cache-control": file.cacheControl,
          },
        },
      );
    },
    {
      open: true,
      detail: {
        hide: true,
        summary: "The Web's files (ADR-004)",
      },
    },
  );
}
