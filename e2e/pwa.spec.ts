import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IdeaDetail, Me } from "@moonx/schemas";
import { devices, type Page } from "@playwright/test";
import { PWA_ORIGIN, PWA_SENTRY_DSN, PWA_WEB_DIR } from "./env";
import { DEMO_PASSWORD, demo, expect, operatorInvited, test } from "./fixtures";

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

/**
 * Chooses Reload on the band with input unsaved and answers the browser's question
 * about leaving, returning its type. It is answered as it comes, the click maybe still
 * in progress: a click waits for a navigation the page starts during it, and the reload
 * waits for the answer. Whether the question comes before or after the click returns is
 * a race between the browser and the test's process, which load decides.
 */
async function reloadAnswering(page: Page, answer: "accept" | "dismiss") {
  const [question] = await Promise.all([
    page.waitForEvent("dialog").then(async (dialog) => {
      await (answer === "accept" ? dialog.accept() : dialog.dismiss());
      return dialog.type();
    }),
    page
      .getByRole("alert")
      .filter({ hasText: NEW_VERSION })
      .getByRole("button", { name: "Reload" })
      .click(),
  ]);
  return question;
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
    const csp = page.headers()["content-security-policy"]?.split("; ") ?? [];
    expect(csp).toContain("script-src 'self'");
    // Where the Web's Sentry sends its events: the origin of WEB_SENTRY_DSN.
    expect(csp).toContain(
      `connect-src 'self' ${new URL(PWA_SENTRY_DSN).origin}`,
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

/** What the checks read of an event the Web's Sentry sends (an envelope's `event` item). */
interface SentryEvent {
  event_id: string;
  environment?: string;
  release?: string;
  request?: { url?: string };
  user?: { id?: string };
  exception?: { values?: { type?: string }[] };
}

/**
 * Receives what the page's Sentry sends to PWA_SENTRY_DSN, answered as Sentry's ingest
 * answers, and returns the events as they arrive. A request the CSP refuses never gets
 * this far, so each event here also passed connect-src (SDD 7.2).
 */
async function sentryEvents(page: Page) {
  const events: SentryEvent[] = [];
  await page.route(`${new URL(PWA_SENTRY_DSN).origin}/**`, async (route) => {
    // An envelope: its header, then each item's header and payload, a line each.
    const [, ...lines] = (route.request().postData() ?? "").split("\n");
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const item = JSON.parse(lines[i] ?? "") as { type?: string };
      if (item.type === "event") {
        events.push(JSON.parse(lines[i + 1] ?? "") as SentryEvent);
      }
    }
    await route.fulfill({
      json: {},
      headers: { "access-control-allow-origin": "*" },
    });
  });
  return events;
}

/**
 * The event whose Ref the page shows, once it has arrived: a Ref is the first 8
 * characters of the event's id (SDD 8.2).
 */
async function eventShown(page: Page, events: SentryEvent[]) {
  const ref = page.getByText(/^Ref: [0-9a-f]{8}$/);
  await expect(ref).toBeVisible();
  const id = ((await ref.textContent()) ?? "").slice("Ref: ".length);
  const shown = () => events.find(({ event_id }) => event_id.startsWith(id));
  await expect.poll(shown).toBeDefined();
  return shown() as SentryEvent;
}

// client.tsx starts Sentry before the first render (SDD 11章), in the build the API
// serves: happy-dom cannot run that entry (SDD 10章). Each screen fails on an answer of
// the API's it cannot read, so the Web's own code throws, as a defect of it would. One
// failure is one event: the screen shows the Ref of each one sent.
test.describe("Sentry from the first screen (SDD 11章)", () => {
  test("a failure to render arrives with the environment, the release and the URL bare, and the screen shows its Ref", async ({
    page,
  }) => {
    const events = await sentryEvents(page);
    const token = "e2eSecretInvitationToken";
    await page.route(`**/api/v1/invitations/by-token/${token}`, (route) =>
      route.fulfill({ contentType: "application/json", body: "null" }),
    );
    await page.goto(`/invite/${token}?from=mail#sign-up`);

    const event = await eventShown(page, events);
    expect(event).toMatchObject({
      // The pwa API's APP_ENV (the root .env) and make test-e2e's build-web SHA=dev.
      environment: "local",
      release: "dev",
      request: { url: `${PWA_ORIGIN}/invite/[redacted]` },
      exception: { values: [{ type: "TypeError" }] },
    });
    expect(event.user).toBeUndefined();
    // Not in the URL nor anywhere else (SDD 7.2「個人情報」).
    expect(JSON.stringify(event)).not.toContain(token);
    expect(JSON.stringify(event)).not.toContain("from=mail");
    expect(events.map(({ event_id }) => event_id)).toEqual([event.event_id]);
  });

  test("while signed in an event names the user by id alone, and after Log out nobody", async ({
    page,
    signIn,
  }) => {
    const events = await sentryEvents(page);
    // A demo user of 8.1: every account this suite invites counts against the
    // operator's hourly limit on invitations (SDD 7.2), and Log out ends only the
    // session of this page. Their last workspace (else BCDX, where they land), so
    // that U2 records nothing that moves where other tests signing in as them land.
    const me = await signIn(demo.otherMember, DEMO_PASSWORD);
    const workspace = (
      me.memberships.find(
        ({ workspace }) => workspace.id === me.lastWorkspaceId,
      ) ?? me.memberships.find(({ workspace }) => !workspace.isPersonal)
    )?.workspace;
    if (workspace === undefined) throw new Error("No workspace");
    await page.route(
      `**/api/v1/workspaces/${workspace.id}/dashboard/ideas`,
      (route) => route.fulfill({ json: {} }),
    );
    await page.goto(`/w/${workspace.id}`);

    // The Ideas block fails alone (BlockBoundary); the screen stays.
    const signedIn = await eventShown(page, events);
    await expect(
      page.getByRole("heading", { level: 1, name: workspace.name }),
    ).toBeVisible();
    expect(signedIn.user).toEqual({ id: me.id });
    expect(events.map(({ event_id }) => event_id)).toEqual([signedIn.event_id]);

    // 1 asks who is signed in, and fails on an answer it cannot read.
    await page.route("**/api/v1/me", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: {} })
        : route.continue(),
    );
    await page
      .getByRole("button", { name: me.displayName, exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(`${PWA_ORIGIN}/`);

    const signedOut = await eventShown(page, events);
    expect(signedOut.request).toEqual({ url: `${PWA_ORIGIN}/` });
    expect(signedOut.user).toBeUndefined();
    expect(events.map(({ event_id }) => event_id)).toEqual([
      signedIn.event_id,
      signedOut.event_id,
    ]);
  });

  test("a signed-in page that fails as it first renders names the user too", async ({
    page,
    signIn,
  }) => {
    const events = await sentryEvents(page);
    // A demo user of 8.1: every account this suite invites counts against the
    // operator's hourly limit on invitations (SDD 7.2), and Log out ends only the
    // session of this page. Their last workspace (else BCDX, where they land), so
    // that U2 records nothing that moves where other tests signing in as them land.
    const me = await signIn(demo.viewer, DEMO_PASSWORD);
    const workspace = (
      me.memberships.find(
        ({ workspace }) => workspace.id === me.lastWorkspaceId,
      ) ?? me.memberships.find(({ workspace }) => !workspace.isPersonal)
    )?.workspace;
    if (workspace === undefined) throw new Error("No workspace");
    // The user, read before anything of the workspace renders, with a name the frame
    // cannot draw: the failure comes in the page's first render with the user known.
    await page.route("**/api/v1/me", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: { ...((await response.json()) as Me), displayName: null },
      });
    });
    await page.goto(`/w/${workspace.id}`);

    const event = await eventShown(page, events);
    expect(event.user).toEqual({ id: me.id });
    expect(events.map(({ event_id }) => event_id)).toEqual([event.event_id]);
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

      // The waiting version takes over first, then the page reloads.
      expect(await reloadAnswering(page, "dismiss")).toBe("beforeunload");
      // Staying keeps the page and the band, whose Reload asks again.
      await expect(page).toHaveURL(new RegExp(`/ideas/${idea.id}$`));
      await expect(band).toBeVisible();

      // This time no version waits, so the page reloads at once.
      const reloaded = page.waitForEvent("load");
      expect(await reloadAnswering(page, "accept")).toBe("beforeunload");
      await reloaded;
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
