import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IdeaDetail, Me } from "@moonx/schemas";
import { devices, type Page } from "@playwright/test";
import { PWA_ORIGIN, PWA_WEB_DIR } from "./env";
import { expect, operatorInvited, test } from "./fixtures";

// SDD 10章「PWA と配信」 in the browser, against the API serving make build-web's output
// (playwright.config.ts, project pwa). What the API answers is apps/api/src/web.test.ts.

const NEW_VERSION = "A new version of moonx is available.";
const ADD_TO_HOME_SCREEN =
  "Add moonx to your Home Screen: tap Share, then Add to Home Screen.";

/** Waits until the page's service worker is installed and in charge of the page. */
async function controlled(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** Every URL the page's origin keeps in Cache Storage, Workbox's revision left off. */
function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        const url = new URL(request.url);
        url.searchParams.delete("__WB_REVISION__");
        urls.push(url.href);
      }
    }
    return urls;
  });
}

/**
 * Stands for a deploy: /sw.js changes, as a build's does (`change` may also change what
 * it lists), until the returned function puts it back. The API reads the build's files
 * as they are asked for.
 */
async function deployNewVersion(change = (worker: string) => worker) {
  const path = join(PWA_WEB_DIR, "sw.js");
  const original = await readFile(path, "utf8");
  await writeFile(path, `${change(original)}\n// e2e: the next version\n`);
  return () => writeFile(path, original);
}

/** Chooses Reload on the band and waits for the page to load again. */
async function chooseReload(page: Page) {
  const reloaded = page.waitForEvent("load");
  await page
    .getByRole("alert")
    .filter({ hasText: NEW_VERSION })
    .getByRole("button", { name: "Reload" })
    .click();
  await reloaded;
}

/** The Japanese font files the service worker keeps (ADR-031). */
async function japaneseFonts(page: Page) {
  return (await cachedUrls(page)).filter((url) =>
    url.includes("/assets/ibm-plex-sans-jp-"),
  );
}

/** Has the browser look for a new service worker, as it does when a page opens. */
async function lookForUpdate(page: Page) {
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
}

const isWaiting = (page: Page) =>
  page.evaluate(
    async () =>
      (await navigator.serviceWorker.getRegistration())?.waiting != null,
  );

/** A user of the test's own, signed in on the page, and their personal workspace. */
async function signedInUser(
  signIn: (email: string, password?: string) => Promise<Me>,
  label: string,
) {
  const account = await operatorInvited(test.info().workerIndex, label);
  const me = await signIn(account.email, account.password);
  const personal = me.memberships.find(({ workspace }) => workspace.isPersonal);
  if (personal === undefined) throw new Error("No personal workspace");
  return personal.workspace;
}

/** 5 Dashboard of a personal workspace: its title is the workspace's name. */
const dashboard = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "Test Person's workspace" });

/** The width of the phone each band check on iPhone stands in. */
const phone = {
  viewport: devices["iPhone 15"].viewport,
  isMobile: true,
  hasTouch: true,
};

test.describe("the manifest and the icons (ADR-031)", () => {
  test("every page names the manifest and the icons", async ({ page }) => {
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      const href = (selector: string) =>
        page.locator(selector).getAttribute("href");
      expect(await href('link[rel="manifest"]')).toBe("/manifest.webmanifest");
      expect(await href('link[rel="icon"][type="image/png"]')).toBe(
        "/icons/favicon.png",
      );
      expect(await href('link[rel="icon"][type="image/svg+xml"]')).toBe(
        "/icons/icon.svg",
      );
      expect(await href('link[rel="apple-touch-icon"]')).toBe(
        "/icons/apple-touch-icon.png",
      );
    }
  });

  test("the manifest is the one make tokens generates, and its icons are there", async ({
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.headers()["content-type"]).toBe(
      "application/manifest+json",
    );
    const manifest = (await response.json()) as {
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    } & Record<string, unknown>;
    expect(manifest).toEqual(
      JSON.parse(
        await readFile(
          new URL(
            "../packages/ui-tokens/src/generated/pwa/manifest.webmanifest",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    expect(manifest).toMatchObject({
      name: "moonx",
      short_name: "moonx",
      display: "standalone",
      start_url: "/",
      scope: "/",
    });
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.background_color).toBe(manifest.theme_color);

    const pngs = [
      ...manifest.icons,
      { src: "/icons/favicon.png", sizes: "32x32", type: "image/png" },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ];
    expect(manifest.icons.map(({ purpose }) => purpose)).toContain("maskable");
    for (const { src, sizes, type } of pngs) {
      const icon = await request.get(src);
      expect(icon.status(), src).toBe(200);
      expect(icon.headers()["content-type"]).toBe(type);
      // A PNG's IHDR holds its width and height at bytes 16 and 20.
      const body = await icon.body();
      expect(`${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`, src).toBe(
        sizes,
      );
    }
    const svg = await request.get("/icons/icon.svg");
    expect(svg.headers()["content-type"]).toBe("image/svg+xml");
  });

  test("the build is served with the headers of ADR-004, ADR-031 and SDD 7.2", async ({
    request,
  }) => {
    const page = await request.get("/w/0b6e4f0e-3c9a-4b8e-9d55-6a1f0c2b7e11");
    expect(page.headers()["content-type"]).toBe("text/html; charset=utf-8");
    expect(page.headers()["cache-control"]).toBe("no-cache");
    expect(page.headers()["content-security-policy"]).toContain(
      "script-src 'self'",
    );
    expect(page.headers()["x-content-type-options"]).toBe("nosniff");
    const html = await page.text();
    expect(html).toContain('<meta name="moonx-app-env" content="local">');
    const scripts = [...html.matchAll(/<script[^>]* src="([^"]+)"/g)].map(
      ([, src]) => src ?? "",
    );
    expect(scripts.length).toBeGreaterThan(1);
    for (const src of scripts) {
      const script = await request.get(src);
      expect(script.headers()["cache-control"], src).toBe(
        "public, max-age=31536000, immutable",
      );
      expect(script.headers()["content-type"], src).toBe(
        "text/javascript; charset=utf-8",
      );
    }

    for (const [path, cacheControl] of [
      ["/sw.js", "no-cache"],
      ["/manifest.webmanifest", "no-cache"],
      ["/icons/icon-192.png", "public, max-age=86400"],
    ] as const) {
      const response = await request.get(path);
      expect(response.headers()["cache-control"], path).toBe(cacheControl);
    }
    expect((await request.get("/assets/missing-Ab12Cd34.js")).status()).toBe(
      404,
    );
  });

  test("Chromium finds nothing that keeps moonx from being installed", async ({
    page,
  }) => {
    await page.goto("/");
    await controlled(page);
    const cdp = await page.context().newCDPSession(page);

    expect(await cdp.send("Page.getInstallabilityErrors")).toEqual({
      installabilityErrors: [],
    });
  });
});

test.describe("the CSP of SDD 7.2 on the Web's pages", () => {
  test("refuses nothing the pages load or run: no inline script, no font as data", async ({
    page,
    signIn,
  }) => {
    await page.addInitScript(() => {
      const refused: string[] = [];
      (window as { refused?: string[] }).refused = refused;
      document.addEventListener("securitypolicyviolation", (event) => {
        refused.push(`${event.effectiveDirective} ${event.blockedURI}`);
      });
    });
    const refused = () =>
      page.evaluate(() => (window as { refused?: string[] }).refused ?? []);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "From idea to a plan you can show." }),
    ).toBeVisible();
    expect(await refused()).toEqual([]);

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    expect(await refused()).toEqual([]);

    const workspace = await signedInUser(signIn, "pwa-csp");
    await page.goto(`/w/${workspace.id}`);
    await expect(dashboard(page)).toBeVisible();
    expect(await refused()).toEqual([]);
  });
});

test.describe("the service worker (ADR-031)", () => {
  test("keeps the outside of the screens only, and never anything of /api/", async ({
    page,
  }) => {
    const apiResponses: { url: string; fromServiceWorker: boolean }[] = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname.startsWith("/api/")) {
        apiResponses.push({
          url: response.url(),
          fromServiceWorker: response.fromServiceWorker(),
        });
      }
    });
    await page.goto("/login");
    await controlled(page);
    await page.evaluate(() => fetch("/api/health"));

    const urls = await cachedUrls(page);
    const at = (path: string) => `${PWA_ORIGIN}${path}`;
    expect(urls).toContain(at("/_shell.html"));
    expect(urls).toContain(at("/icons/icon-192.png"));
    expect(urls.some((url) => /\/assets\/[^/]+\.js$/.test(url))).toBe(true);
    expect(urls.some((url) => /\/assets\/[^/]+\.css$/.test(url))).toBe(true);
    expect(
      urls.some((url) => /ibm-plex-sans-latin-400-[^/]+\.woff2$/.test(url)),
    ).toBe(true);
    expect(
      urls.some((url) => /ibm-plex-mono-latin-400-[^/]+\.woff2$/.test(url)),
    ).toBe(true);
    // The landing and the pages are never kept, nor the Japanese fonts before use.
    expect(urls).not.toContain(at("/"));
    expect(urls).not.toContain(at("/index.html"));
    expect(urls.filter((url) => url.includes("/api/"))).toEqual([]);
    expect(urls.filter((url) => url.includes("ibm-plex-sans-jp-"))).toEqual([]);

    expect(apiResponses.length).toBeGreaterThan(0);
    expect(
      apiResponses.filter((response) => response.fromServiceWorker),
    ).toEqual([]);
  });

  test("keeps a Japanese font once a page draws it", async ({ page }) => {
    await page.goto("/login");
    await controlled(page);
    await page.evaluate(() => {
      const text = document.createElement("p");
      text.textContent = "日本語の文字";
      document.body.append(text);
    });

    await expect
      .poll(async () => (await japaneseFonts(page)).length)
      .toBeGreaterThan(0);
  });

  test("a new version drops the Japanese fonts its build no longer has", async ({
    page,
  }) => {
    await page.goto("/login");
    await controlled(page);
    // Two weights of the same characters: two files at least.
    await page.evaluate(() => {
      for (const weight of ["400", "600"]) {
        const text = document.createElement("p");
        text.textContent = "日本";
        text.style.fontWeight = weight;
        document.body.append(text);
      }
    });
    await expect
      .poll(async () => (await japaneseFonts(page)).length)
      .toBeGreaterThanOrEqual(2);
    const [dropped = "", ...kept] = (await japaneseFonts(page)).sort();
    const droppedFile = new URL(dropped).pathname.slice(1);

    // Still a Japanese font by its name, so the new version does not install it.
    const restore = await deployNewVersion((worker) =>
      worker.replaceAll(
        droppedFile,
        droppedFile.replace(/\.woff2$/, "-gone.woff2"),
      ),
    );
    try {
      await lookForUpdate(page);
      await expect(
        page.getByRole("alert").filter({ hasText: NEW_VERSION }),
      ).toBeVisible();
      await chooseReload(page);

      await expect
        .poll(async () => (await japaneseFonts(page)).sort())
        .toEqual(kept);
    } finally {
      await restore();
    }
  });

  test("offline: /api/ gets no stand-in answer, and a screen opens on the kept shell", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await controlled(page);

    await context.setOffline(true);
    try {
      expect(
        await page.evaluate(() =>
          fetch("/api/health").then(
            () => "answered",
            () => "failed",
          ),
        ),
      ).toBe("failed");

      await page.goto("/w/0b6e4f0e-3c9a-4b8e-9d55-6a1f0c2b7e11/ideas");
      await expect(
        page.getByRole("heading", {
          name: "You're offline. Connect to the internet to open this page.",
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "You're offline. Changes can't be saved until you reconnect.",
        ),
      ).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});

test.describe("a new version (design-spec 6.0.6「新しい版がある」)", () => {
  test("waits for Reload, shows again on the next page after Close, and takes over on Reload", async ({
    page,
  }) => {
    await page.goto("/login");
    await controlled(page);
    const restore = await deployNewVersion();
    try {
      await lookForUpdate(page);
      const band = page.getByRole("alert").filter({ hasText: NEW_VERSION });
      await expect(band).toBeVisible();
      // Not skipped on its own: it still waits a while later.
      await page.waitForTimeout(1_000);
      expect(await isWaiting(page)).toBe(true);

      await band.getByRole("button", { name: "Close" }).click();
      await expect(band).toBeHidden();
      await page.reload();
      await expect(band).toBeVisible();

      await page.evaluate(() => {
        (window as { beforeReload?: boolean }).beforeReload = true;
      });
      const reloaded = page.waitForEvent("load");
      await band.getByRole("button", { name: "Reload" }).click();
      await reloaded;
      expect(
        await page.evaluate(
          () => (window as { beforeReload?: boolean }).beforeReload ?? false,
        ),
      ).toBe(false);
      await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
      await expect(band).toBeHidden();
      expect(await isWaiting(page)).toBe(false);
    } finally {
      await restore();
    }
  });

  test("Reload with input unsaved asks the browser's question first", async ({
    page,
    signIn,
  }) => {
    const workspace = await signedInUser(signIn, "pwa-unsaved");
    const created = await page.request.post(
      `/api/v1/workspaces/${workspace.id}/ideas`,
      {
        data: { name: "Puto Stand", oneLineConcept: "Puto by the church." },
        headers: { Origin: PWA_ORIGIN },
      },
    );
    expect(created.status(), await created.text()).toBe(201);
    const idea = (await created.json()) as IdeaDetail;
    await page.goto(`/w/${workspace.id}/ideas/${idea.id}`);
    await controlled(page);
    // Saves fail, so the input stays unsaved.
    await page.route(`**/api/v1/ideas/${idea.id}`, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 503, body: "Service Unavailable" })
        : route.continue(),
    );
    await page.getByRole("button", { name: "Edit summary" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit summary" });
    await sheet
      .getByRole("textbox", { name: /^One-line concept/ })
      .fill("Not saved yet.");
    await expect(sheet.getByText("Couldn't save")).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();

    const restore = await deployNewVersion();
    try {
      await lookForUpdate(page);
      const band = page.getByRole("alert").filter({ hasText: NEW_VERSION });
      await expect(band).toBeVisible();

      const asked = page.waitForEvent("dialog");
      await band.getByRole("button", { name: "Reload" }).click();
      const question = await asked;
      expect(question.type()).toBe("beforeunload");
      await question.dismiss();
      // Staying keeps the page and the band, whose Reload asks again.
      await expect(page).toHaveURL(new RegExp(`/ideas/${idea.id}$`));
      await expect(band).toBeVisible();

      // This time the page reloads at once, so the question comes while Reload is
      // still being pressed: answered as it comes.
      const askedAgain: string[] = [];
      page.once("dialog", async (dialog) => {
        askedAgain.push(dialog.type());
        await dialog.accept();
      });
      const reloaded = page.waitForEvent("load");
      await band.getByRole("button", { name: "Reload" }).click();
      await reloaded;
      expect(askedAgain).toEqual(["beforeunload"]);
      await expect(
        page.getByRole("heading", { level: 1, name: "Puto Stand" }),
      ).toBeVisible();
      await expect(band).toBeHidden();
    } finally {
      await restore();
    }
  });
});

test.describe("the Home Screen hint on iPhone's Safari (design-spec 6.0.6)", () => {
  test.use({
    ...phone,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  });

  test("shows on the signed-in screens until closed, which the browser remembers", async ({
    page,
    signIn,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    await expect(page.getByText(ADD_TO_HOME_SCREEN)).toBeHidden();

    const workspace = await signedInUser(signIn, "pwa-iphone");
    await page.goto(`/w/${workspace.id}`);
    const band = page
      .getByRole("alert")
      .filter({ hasText: ADD_TO_HOME_SCREEN });
    await expect(band).toBeVisible();

    await band.getByRole("button", { name: "Close" }).click();
    await expect(band).toBeHidden();
    await page.reload();
    await expect(dashboard(page)).toBeVisible();
    await expect(band).toBeHidden();
  });

  test("not when opened from the home screen", async ({ page, signIn }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { get: () => true });
    });
    const workspace = await signedInUser(signIn, "pwa-standalone");
    await page.goto(`/w/${workspace.id}`);

    await expect(dashboard(page)).toBeVisible();
    await expect(page.getByText(ADD_TO_HOME_SCREEN)).toBeHidden();
  });
});

for (const [browser, userAgent] of [
  [
    "Chrome on an iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  ],
  [
    "Chrome on Android",
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  ],
  ["Chrome on a desktop", devices["Desktop Chrome"].userAgent],
] as const) {
  test.describe(`no Home Screen hint in ${browser} (design-spec 6.0.6)`, () => {
    test.use({ userAgent });

    test("the signed-in screens show none", async ({ page, signIn }) => {
      const workspace = await signedInUser(signIn, "pwa-other");
      await page.goto(`/w/${workspace.id}`);

      await expect(dashboard(page)).toBeVisible();
      await expect(page.getByText(ADD_TO_HOME_SCREEN)).toBeHidden();
    });
  });
}
