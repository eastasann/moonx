import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import type { Config } from "./config";
import { HEALTH_DB_IP_LIMIT } from "./health";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import { chooseEncoding, WebBuildError } from "./web";

// ADR-004 and ADR-031 on a build laid out as make build-web writes it (SDD 10章「PWA と
// 配信」). The browser's side of it is e2e/pwa.spec.ts.

const database = connectTestDatabase();
const directories: string[] = [];
afterAll(async () => {
  await database.close();
  for (const directory of directories) rmSync(directory, { recursive: true });
});

const page = (title: string) =>
  `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><title>${title}</title></head><body></body></html>`;

/** A Web build in a fresh directory: the files by their path under it. */
function writeBuild(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), "moonx-web-"));
  directories.push(directory);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  }
  return directory;
}

const BUILD = {
  "index.html": page("Landing"),
  "_shell.html": page("Shell"),
  "privacy/index.html": page("Privacy"),
  "support.html": page("Support"),
  "assets/index-Ab12-_Cd.js": "console.log('app')",
  "assets/online-Ef34Gh56.css": "body{}",
  "assets/ibm-plex-sans-latin-400-normal-Ij78Kl90.woff2": "woff2",
  "sw.js": "self.addEventListener('fetch', () => {})",
  "manifest.webmanifest": '{"name":"moonx"}',
  "icons/icon-192.png": "png",
  "icons/icon.svg": "<svg/>",
  "robots.txt": "User-agent: *",
  ".DS_Store": "finder",
};

const CSP =
  "default-src 'self'; script-src 'self'; img-src 'self' data: https://storage.googleapis.com; connect-src 'self' https://*.ingest.sentry.io; style-src 'self' 'unsafe-inline'; font-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'";

const DSN = "https://key@o1.ingest.sentry.io/2";

function webApp(config: Partial<Config> = {}) {
  return buildTestApp(database, {
    config: {
      webDistDir: writeBuild(BUILD),
      webSentryDsn: DSN,
      ...config,
    },
  }).app;
}

const app = webApp();
const get = (path: string, init: RequestInit = {}) =>
  app.handle(new Request(`http://localhost${path}`, init));

describe("the Web's pages (ADR-004)", () => {
  test("/ is the landing, with the meta elements of the environment", async () => {
    const response = await get("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.text()).toBe(
      `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><title>Landing</title><meta name="moonx-app-env" content="test"><meta name="moonx-sentry-dsn" content="${DSN}"></head><body></body></html>`,
    );
  });

  for (const path of [
    "/login",
    "/w/0b6e4f0e-3c9a-4b8e-9d55-6a1f0c2b7e11/ideas",
    "/ideas/",
    "/api",
    "/apix",
    // Not the landing or the shell under another name (ADR-004: every other screen).
    "/index",
    "/_shell",
    // A section key with a dot (SDD 5.13 lets a template name its sections freely).
    "/w/0b6e4f0e-3c9a-4b8e-9d55-6a1f0c2b7e11/self-analysis/1.5",
  ]) {
    test(`the screen path ${path} is the shell`, async () => {
      const response = await get(path);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(await response.text()).toContain("<title>Shell</title>");
    });
  }

  for (const [path, title] of [
    ["/privacy", "Privacy"],
    ["/privacy/", "Privacy"],
    ["/support", "Support"],
  ] as const) {
    test(`${path} is the page the build prerendered for it`, async () => {
      const response = await get(path);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`<title>${title}</title>`);
    });
  }

  test("the shell itself is served too, as the service worker caches it (ADR-031)", async () => {
    const response = await get("/_shell.html");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.text()).toContain(
      '<meta name="moonx-app-env" content="test">',
    );
  });

  test("escapes the values it writes into the meta elements", async () => {
    const odd = webApp({ webSentryDsn: `https://x"><script>&$'` });
    const html = await (
      await odd.handle(new Request("http://localhost/login"))
    ).text();

    expect(html).toContain(
      `<meta name="moonx-sentry-dsn" content="https://x&quot;&gt;&lt;script&gt;&amp;$'">`,
    );
  });

  test("writes an empty Sentry DSN where the Web reports nowhere", async () => {
    const quiet = webApp({ webSentryDsn: undefined });
    const html = await (
      await quiet.handle(new Request("http://localhost/"))
    ).text();

    expect(html).toContain('<meta name="moonx-sentry-dsn" content="">');
  });

  test("answers HEAD with the headers of GET", async () => {
    const response = await get("/login", { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });
});

describe("the Web's files (ADR-004, ADR-031)", () => {
  const files: [string, string, string, string][] = [
    [
      "/assets/index-Ab12-_Cd.js",
      "text/javascript; charset=utf-8",
      "public, max-age=31536000, immutable",
      "console.log('app')",
    ],
    [
      "/assets/online-Ef34Gh56.css",
      "text/css; charset=utf-8",
      "public, max-age=31536000, immutable",
      "body{}",
    ],
    [
      "/assets/ibm-plex-sans-latin-400-normal-Ij78Kl90.woff2",
      "font/woff2",
      "public, max-age=31536000, immutable",
      "woff2",
    ],
    [
      "/sw.js",
      "text/javascript; charset=utf-8",
      "no-cache",
      "self.addEventListener('fetch', () => {})",
    ],
    [
      "/manifest.webmanifest",
      "application/manifest+json",
      "no-cache",
      '{"name":"moonx"}',
    ],
    ["/icons/icon-192.png", "image/png", "public, max-age=86400", "png"],
    ["/icons/icon.svg", "image/svg+xml", "public, max-age=86400", "<svg/>"],
    [
      "/robots.txt",
      "text/plain; charset=utf-8",
      "public, max-age=86400",
      "User-agent: *",
    ],
  ];
  for (const [path, contentType, cacheControl, body] of files) {
    test(`${path} is ${contentType}, ${cacheControl}`, async () => {
      const response = await get(path);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(contentType);
      expect(response.headers.get("cache-control")).toBe(cacheControl);
      expect(await response.text()).toBe(body);
    });
  }

  for (const path of [
    "/assets/missing-Ab12Cd34.js",
    "/assets/screen",
    "/missing.png",
    "/icons/missing.png",
    "/.DS_Store",
    "/report.pdf",
    "/icons/missing",
  ]) {
    test(`${path}, which the build does not have, is 404`, async () => {
      const response = await get(path);

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
    });
  }

  test("an /api/ path no route takes stays the API's 404", async () => {
    const response = await get("/api/v1/nothing-here");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "No route matches the request" },
    });
  });

  test("the API's routes answer as before", async () => {
    const response = await get("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  test("only GET (and HEAD) reach the files", async () => {
    const response = await get("/login", { method: "POST" });

    expect(response.status).toBe(404);
  });
});

describe("compression of the Web's text (ADR-004)", () => {
  const script = "console.log('moonx');\n".repeat(400);
  const landing = page(`Landing ${"moonx ".repeat(400)}`);
  const big = buildTestApp(database, {
    config: {
      webDistDir: writeBuild({
        ...BUILD,
        "index.html": landing,
        "assets/screens-Mn12Op34.js": script,
        "assets/plex-Qr56St78.woff2": "woff2".repeat(400),
      }),
    },
  }).app;
  const fetchAs = (path: string, acceptEncoding?: string) =>
    big.handle(
      new Request(`http://localhost${path}`, {
        headers:
          acceptEncoding === undefined
            ? {}
            : { "accept-encoding": acceptEncoding },
      }),
    );
  const bytes = async (response: Response) =>
    Buffer.from(await response.arrayBuffer());

  test("a script goes in Brotli to a browser that takes it", async () => {
    const response = await fetchAs(
      "/assets/screens-Mn12Op34.js",
      "gzip, deflate, br, zstd",
    );

    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(response.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const body = await bytes(response);
    expect(body.length).toBeLessThan(script.length / 10);
    expect(brotliDecompressSync(body).toString()).toBe(script);
  });

  test("a file changed on the disk goes out changed, compressed or not", async () => {
    // e2e/pwa.spec.ts writes a new /sw.js under the running API.
    const directory = writeBuild({ ...BUILD, "sw.js": script });
    const served = buildTestApp(database, {
      config: { webDistDir: directory },
    }).app;
    const sw = (acceptEncoding: string) =>
      served.handle(
        new Request("http://localhost/sw.js", {
          headers: { "accept-encoding": acceptEncoding },
        }),
      );
    expect(brotliDecompressSync(await bytes(await sw("br"))).toString()).toBe(
      script,
    );

    const next = `${script}// version 2\n`;
    writeFileSync(join(directory, "sw.js"), next);
    expect(brotliDecompressSync(await bytes(await sw("br"))).toString()).toBe(
      next,
    );
    expect(gunzipSync(await bytes(await sw("gzip"))).toString()).toBe(next);
    expect(await (await sw("identity")).text()).toBe(next);
  });

  test("gzip to a browser that takes only gzip", async () => {
    const response = await fetchAs("/assets/screens-Mn12Op34.js", "gzip");

    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(gunzipSync(await bytes(response)).toString()).toBe(script);
  });

  test("the pages go compressed with their meta elements", async () => {
    for (const path of ["/", "/login"]) {
      const response = await fetchAs(path, "br");

      expect(response.headers.get("content-encoding")).toBe("br");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(brotliDecompressSync(await bytes(response)).toString()).toContain(
        '<meta name="moonx-app-env" content="test">',
      );
    }
  });

  for (const acceptEncoding of [
    undefined,
    "identity",
    "br;q=0, gzip;q=0",
    "*;q=0",
    "deflate",
  ]) {
    test(`as it is to Accept-Encoding: ${acceptEncoding ?? "(none)"}`, async () => {
      const response = await fetchAs(
        "/assets/screens-Mn12Op34.js",
        acceptEncoding,
      );

      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("vary")).toBe("Accept-Encoding");
      expect(await response.text()).toBe(script);
    });
  }

  test("a file compression would not shrink goes as it is", async () => {
    const response = await fetchAs("/assets/index-Ab12-_Cd.js", "br, gzip");

    expect(response.headers.get("content-encoding")).toBeNull();
    expect(await response.text()).toBe("console.log('app')");
  });

  test("fonts and images go as they are, compressed already", async () => {
    for (const path of ["/assets/plex-Qr56St78.woff2", "/icons/icon-192.png"]) {
      const response = await fetchAs(path, "br, gzip");

      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("vary")).toBeNull();
    }
  });
});

describe("chooseEncoding (RFC 9110 12.5.3)", () => {
  for (const [accept, chosen] of [
    [null, null],
    ["", null],
    ["gzip, deflate, br, zstd", "br"],
    ["BR", "br"],
    ["gzip", "gzip"],
    ["gzip;q=1.0, br;q=0.5", "gzip"],
    ["br;q=0.8, gzip;q=0.8", "br"],
    ["br;q=0, gzip", "gzip"],
    ["*", "br"],
    ["*;q=0.5, br;q=0", "gzip"],
    ["gzip;q=x", null],
    ["identity, deflate", null],
  ] as const) {
    test(`${accept === null ? "no header" : `"${accept}"`} → ${chosen ?? "none"}`, () => {
      expect(chooseEncoding(accept)).toBe(chosen);
    });
  }
});

describe("headers on the Web's responses (SDD 7.2)", () => {
  for (const path of ["/", "/login", "/sw.js", "/assets/index-Ab12-_Cd.js"]) {
    test(`${path} carries the security headers`, async () => {
      const response = await get(path);

      expect(response.headers.get("content-security-policy")).toBe(CSP);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(response.headers.get("permissions-policy")).toBe(
        "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      );
      expect(response.headers.get("strict-transport-security")).toBeNull();
    });
  }

  test("adds HSTS where the Web is served over HTTPS", async () => {
    const staging = webApp({
      appEnv: "staging",
      avatarBucket: "test-moonx-staging-avatars",
    });
    const response = await staging.handle(new Request("http://localhost/"));

    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(await response.text()).toContain(
      '<meta name="moonx-app-env" content="staging">',
    );
  });
});

describe("caller IP with the Web served (SDD 7.2「呼び出し元の IP」)", () => {
  test("a forged left side of X-Forwarded-For does not escape a limit", async () => {
    const caller = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i <= HEALTH_DB_IP_LIMIT.limit.max; i++) {
      const response = await get("/api/health/db", {
        headers: { "x-forwarded-for": `${uniqueIp()}, ${caller}` },
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

// That the API process then exits with one log line is index.test.ts.
describe("a WEB_DIST_DIR without a build of the Web (ADR-004)", () => {
  const refuses = (webDistDir: string) => () =>
    buildTestApp(database, { config: { webDistDir } });

  test("refuses to build the app when the directory cannot be read", () => {
    expect(refuses(join(tmpdir(), "moonx-web-missing-dir"))).toThrow(
      WebBuildError,
    );
  });

  test("refuses to build the app when a file in it cannot be read", () => {
    const directory = writeBuild(BUILD);
    symlinkSync(join(directory, "nowhere"), join(directory, "broken"));

    expect(refuses(directory)).toThrow(WebBuildError);
  });

  test("refuses to build the app without the shell or the landing", () => {
    const { "_shell.html": _, ...noShell } = BUILD;
    const { "index.html": __, ...noLanding } = BUILD;

    expect(refuses(writeBuild(noShell))).toThrow(/_shell\.html/);
    expect(refuses(writeBuild(noLanding))).toThrow(/index\.html/);
  });

  test("refuses to build the app when an HTML file has no </head> for the meta elements", () => {
    expect(
      refuses(writeBuild({ ...BUILD, "_shell.html": "<html><body>" })),
    ).toThrow(/_shell\.html in WEB_DIST_DIR has no <\/head>/);
  });
});
