import type { Me } from "@moonx/schemas";
import { type Browser, devices, type Page } from "@playwright/test";
import {
  DEMO_PASSWORD,
  demo,
  expect,
  nextAddress,
  test,
  workspaceOf,
} from "./fixtures";

// SDD 7.3「Web の最初の表示」 estimated on this machine (make first-paint, SDD 10章):
// make build-web's output served by the API (project first-paint), opened the first time
// with nothing cached, on a phone's screen, with WebPageTest's 4G figures in Chromium's
// throttling and the CPU 4 times slower. The CPU follows the host's, so CI does not run
// it. Chromium adds the latency once per request, with no TCP or TLS round trips, and
// the local API speaks HTTP/1.1 without TLS: an estimate, not a WebPageTest run.

/** WebPageTest's 4G figures: 9 Mbps each way, 170 ms of latency. */
const NETWORK = {
  offline: false,
  latency: 170,
  downloadThroughput: (9 * 1_000_000) / 8,
  uploadThroughput: (9 * 1_000_000) / 8,
};
const CPU_SLOWDOWN = 4;
/** The median of these many first loads is held to the budget. */
const RUNS = 3;
const LCP_BUDGET_MS = 2_500;
/** How long no new LCP entry may come before the last one is taken as the page's. */
const QUIET_MS = 1_000;
/** How long a throttled load may take to be ready, so that a slow one still prints. */
const LOAD_TIMEOUT_MS = 30_000;

test.describe.configure({ timeout: RUNS * 2 * LOAD_TIMEOUT_MS });

declare global {
  interface Window {
    /** The latest largest-contentful-paint entry's time, as the page reports it. */
    __lcp?: number;
    /** When that entry was reported (`performance.now()`). */
    __lcpReportedAt?: number;
  }
}

type StorageState = Awaited<
  ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>
>;

/** One first load of `path` in a fresh profile: its LCP in ms once `ready` holds. */
async function firstLoadLcp(
  browser: Browser,
  baseURL: string,
  path: string,
  ready: (page: Page) => Promise<void>,
  storageState?: StorageState,
) {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL,
    storageState,
    // Chromium's throttling of the page does not reach the service worker: unblocked, it
    // would cache the build within moments of the load, take the page (src/sw.ts) and
    // hand it the route's chunks unthrottled. A real first visit caches over the same 4G
    // first. Playwright blocks it by making register() do nothing.
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__lcp = entry.startTime;
          window.__lcpReportedAt = performance.now();
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", NETWORK);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
    await page.goto(path);
    // The throttling took: the page's own response ended after the latency at least
    // (its responseStart may leave the latency out).
    const responseEnd = await page.evaluate(
      () =>
        (
          performance.getEntriesByType("navigation")[0] as
            | PerformanceNavigationTiming
            | undefined
        )?.responseEnd ?? 0,
    );
    expect(responseEnd).toBeGreaterThanOrEqual(NETWORK.latency);
    await ready(page);
    // An entry is reported some frames after its paint, and a larger paint after it
    // replaces it: the last one stands once a second has gone by without another, from
    // when the content was there at the latest.
    const readyAt = await page.evaluate(() => performance.now());
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ since, quietMs }) =>
              window.__lcpReportedAt !== undefined &&
              performance.now() - Math.max(since, window.__lcpReportedAt) >=
                quietMs,
            { since: readyAt, quietMs: QUIET_MS },
          ),
        {
          message: "an LCP entry, then none for a while",
          timeout: LOAD_TIMEOUT_MS,
        },
      )
      .toBe(true);
    return (await page.evaluate(() => window.__lcp)) ?? Number.NaN;
  } finally {
    await context.close();
  }
}

/** Measures `path` {@link RUNS} times and holds the median to the budget. */
async function expectFirstPaint(
  browser: Browser,
  baseURL: string | undefined,
  path: string,
  ready: (page: Page) => Promise<void>,
  storageState?: StorageState,
) {
  if (baseURL === undefined) throw new Error("The project names no baseURL");
  const runs: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    runs.push(await firstLoadLcp(browser, baseURL, path, ready, storageState));
  }
  runs.sort((a, b) => a - b);
  const median = runs[Math.floor(RUNS / 2)] ?? Number.NaN;
  console.log(
    `${path}: LCP ${Math.round(median)} ms (runs: ${runs.map(Math.round).join(", ")} ms)`,
  );
  expect(median).toBeLessThanOrEqual(LCP_BUDGET_MS);
}

test("1 Landing", async ({ browser, baseURL }) => {
  await expectFirstPaint(browser, baseURL, "/", (page) =>
    expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: LOAD_TIMEOUT_MS,
    }),
  );
});

test("the shell, at 2 Log in", async ({ browser, baseURL }) => {
  await expectFirstPaint(browser, baseURL, "/login", (page) =>
    expect(page.getByRole("button", { name: "Log in" })).toBeVisible({
      timeout: LOAD_TIMEOUT_MS,
    }),
  );
});

test("5 Dashboard of the seeded BCDX", async ({
  browser,
  baseURL,
}, testInfo) => {
  // Signed in once; each load starts from the session cookie alone.
  const auth = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "X-Forwarded-For": nextAddress(testInfo.workerIndex) },
  });
  const signedIn = await auth.request.post("/api/auth/sign-in/email", {
    data: { email: demo.owner, password: DEMO_PASSWORD },
    headers: { Origin: baseURL ?? "" },
  });
  expect(signedIn.ok(), await signedIn.text()).toBe(true);
  const me = (await (await auth.request.get("/api/v1/me")).json()) as Me;
  const bcdx = workspaceOf(me, "BCDX");
  const session = await auth.storageState();
  await auth.close();

  await expectFirstPaint(
    browser,
    baseURL,
    `/w/${bcdx.id}`,
    async (page) => {
      await expect(
        page.getByRole("heading", { level: 1, name: "BCDX" }),
      ).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
      for (const name of [
        "Ideas",
        "Due soon",
        "Self analyses",
        "Recent activity",
      ]) {
        await expect(
          page.getByRole("region", { name, exact: true }),
        ).not.toHaveAttribute("aria-busy", "true", {
          timeout: LOAD_TIMEOUT_MS,
        });
      }
    },
    session,
  );
});
