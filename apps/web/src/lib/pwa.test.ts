import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ServiceWorkerHost } from "./pwa";
import { SKIP_WAITING } from "./sw-messages";

// lib/pwa.ts keeps the page's service worker and its band in the module, as a page has
// one of each: every test loads a fresh copy, as a page load would.
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

const loadPwa = () => import("./pwa");

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installing";
  readonly postMessage = vi.fn();

  become(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  readonly update = vi.fn(async () => this);

  /** A new version found and installed, which then waits. */
  install(worker = new FakeWorker()) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
    this.installing = null;
    this.waiting = worker;
    worker.become("installed");
    return worker;
  }
}

/**
 * A page's browser: its service worker container, document, reload and timers. A version
 * is active when the page is controlled, unless `active` says otherwise (Shift+Reload
 * opens a page no worker controls).
 */
function fakeHost({
  controlled,
  active = controlled,
}: {
  controlled: boolean;
  active?: boolean;
}) {
  const registration = new FakeRegistration();
  if (active) registration.active = new FakeWorker();
  const container = Object.assign(new EventTarget(), {
    controller: controlled ? {} : null,
    register: vi.fn(async () => registration),
  });
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const intervals: { callback: () => void; ms: number }[] = [];
  const host = {
    container,
    document,
    reload: vi.fn(),
    setInterval: (callback: () => void, ms: number) =>
      intervals.push({ callback, ms }),
  };
  return {
    host: host as unknown as ServiceWorkerHost,
    container,
    document,
    registration,
    reload: host.reload,
    intervals,
    /** A worker takes the page: the waiting one activated, or the first claimed it. */
    takeOver() {
      registration.active = registration.waiting ?? registration.active;
      registration.waiting = null;
      container.controller = {};
      container.dispatchEvent(new Event("controllerchange"));
    },
  };
}

async function started(controlled: boolean) {
  const pwa = await loadPwa();
  const fake = fakeHost({ controlled });
  await pwa.registerServiceWorker(fake.host);
  const band = renderHook(() => pwa.useNewVersion());
  return { pwa, fake, band };
}

describe("registerServiceWorker (ADR-031)", () => {
  test("registers /sw.js for the whole site", async () => {
    const { fake } = await started(true);

    expect(fake.container.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
    });
  });

  test("a version already waiting when the page opens shows the band", async () => {
    const pwa = await loadPwa();
    const fake = fakeHost({ controlled: true });
    fake.registration.waiting = new FakeWorker();
    await pwa.registerServiceWorker(fake.host);

    expect(renderHook(() => pwa.useNewVersion()).result.current.isShown).toBe(
      true,
    );
  });

  test("a new version found while the page is open shows the band", async () => {
    const { fake, band } = await started(true);
    expect(band.result.current.isShown).toBe(false);

    act(() => void fake.registration.install());

    expect(band.result.current.isShown).toBe(true);
  });

  test("the first install is no new version, nor its taking the page", async () => {
    const { fake, band } = await started(false);

    act(() => {
      fake.registration.install();
      fake.takeOver();
    });

    expect(band.result.current.isShown).toBe(false);
    expect(fake.reload).not.toHaveBeenCalled();
  });

  test("a page no worker controls (Shift+Reload) still learns of a new version", async () => {
    const pwa = await loadPwa();
    const fake = fakeHost({ controlled: false, active: true });
    await pwa.registerServiceWorker(fake.host);
    const band = renderHook(() => pwa.useNewVersion());

    act(() => void fake.registration.install());
    expect(band.result.current.isShown).toBe(true);
  });

  test("another tab's move takes a page no worker controls, and shows the band", async () => {
    const pwa = await loadPwa();
    const fake = fakeHost({ controlled: false, active: true });
    await pwa.registerServiceWorker(fake.host);
    const band = renderHook(() => pwa.useNewVersion());
    fake.registration.install();

    act(() => fake.takeOver());
    expect(band.result.current.isShown).toBe(true);
  });

  test("a browser set to refuse service workers is not reported", async () => {
    const sentry = await import("./sentry");
    const reported = vi.spyOn(sentry, "reportError").mockReturnValue(null);
    const pwa = await loadPwa();
    const fake = fakeHost({ controlled: false });
    fake.container.register.mockRejectedValueOnce(
      new DOMException("The user denied permission", "SecurityError"),
    );

    await pwa.registerServiceWorker(fake.host);

    expect(reported).not.toHaveBeenCalled();
  });

  test("never moves to a new version on its own", async () => {
    const { fake } = await started(true);

    const worker = fake.registration.install();

    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(fake.reload).not.toHaveBeenCalled();
  });

  test("Reload lets the waiting version take over, then reloads the page", async () => {
    const { fake, band } = await started(true);
    const worker = fake.registration.install();

    act(() => band.result.current.reload());
    expect(worker.postMessage).toHaveBeenCalledWith(SKIP_WAITING);
    expect(fake.reload).not.toHaveBeenCalled();

    act(() => fake.takeOver());
    expect(fake.reload).toHaveBeenCalledOnce();
    // Kept while the browser asks about unsaved input, in case the user stays.
    expect(band.result.current.isShown).toBe(true);
  });

  test("a version another tab moved to keeps the band, and Reload only reloads", async () => {
    const { fake, band } = await started(true);
    fake.registration.install();

    act(() => fake.takeOver());
    expect(band.result.current.isShown).toBe(true);
    expect(fake.reload).not.toHaveBeenCalled();

    act(() => band.result.current.reload());
    expect(fake.reload).toHaveBeenCalledOnce();
  });

  test("closing the band hides it on this page; the next page shows it again", async () => {
    const { fake, band } = await started(true);
    fake.registration.install();

    act(() => band.result.current.dismiss());
    expect(band.result.current.isShown).toBe(false);

    vi.resetModules();
    const next = await loadPwa();
    const host = fakeHost({ controlled: true });
    host.registration.waiting = new FakeWorker();
    await next.registerServiceWorker(host.host);
    expect(renderHook(() => next.useNewVersion()).result.current.isShown).toBe(
      true,
    );
  });

  test("asks for a new version when the page comes back into view and every hour", async () => {
    const { pwa, fake } = await started(true);

    fake.document.visibilityState = "hidden";
    fake.document.dispatchEvent(new Event("visibilitychange"));
    expect(fake.registration.update).not.toHaveBeenCalled();

    fake.document.visibilityState = "visible";
    fake.document.dispatchEvent(new Event("visibilitychange"));
    expect(fake.registration.update).toHaveBeenCalledOnce();

    expect(fake.intervals.map(({ ms }) => ms)).toEqual([60 * 60 * 1000]);
    expect(pwa.UPDATE_CHECK_MS).toBe(60 * 60 * 1000);
    fake.intervals[0]?.callback();
    expect(fake.registration.update).toHaveBeenCalledTimes(2);
  });

  test("a check that fails offline leaves the page as it was", async () => {
    const { fake, band } = await started(true);
    fake.registration.update.mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );

    fake.intervals[0]?.callback();
    await Promise.resolve();

    expect(band.result.current.isShown).toBe(false);
  });

  test("a registration that fails is reported, and the page goes on", async () => {
    const sentry = await import("./sentry");
    const reported = vi.spyOn(sentry, "reportError").mockReturnValue(null);
    const pwa = await loadPwa();
    const fake = fakeHost({ controlled: false });
    const failure = new TypeError("bad HTTP response code (404)");
    fake.container.register.mockRejectedValueOnce(failure);

    await pwa.registerServiceWorker(fake.host);

    expect(reported).toHaveBeenCalledWith(failure);
    expect(renderHook(() => pwa.useNewVersion()).result.current.isShown).toBe(
      false,
    );
  });
});

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

describe("isIPhoneSafari (design-spec 6.0.6)", () => {
  const agents: [string, string, boolean][] = [
    ["Safari on an iPhone", IPHONE_SAFARI, true],
    [
      "Chrome on an iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
      false,
    ],
    [
      "Firefox on an iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15",
      false,
    ],
    [
      "Edge on an iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/138.0.3351.95 Mobile/15E148 Safari/605.1.15",
      false,
    ],
    [
      "DuckDuckGo on an iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 Ddg/18.5",
      false,
    ],
    [
      "an app's web view on an iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101]",
      false,
    ],
    [
      "Safari on an iPad",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
      false,
    ],
    [
      "Chrome on Android",
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
      false,
    ],
  ];
  for (const [name, agent, expected] of agents) {
    test(`${name}: ${expected}`, async () => {
      const { isIPhoneSafari } = await loadPwa();
      expect(isIPhoneSafari(agent)).toBe(expected);
    });
  }
});

describe("useAddToHomeScreen (design-spec 6.0.6)", () => {
  const asBrowser = (userAgent: string, standalone = false) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: standalone && query === "(display-mode: standalone)",
        }) as MediaQueryList,
    );
  };

  test("shows in iPhone's Safari, opened outside the home screen", async () => {
    asBrowser(IPHONE_SAFARI);
    const pwa = await loadPwa();

    expect(renderHook(() => pwa.useAddToHomeScreen()).result.current).toEqual(
      expect.objectContaining({ isShown: true }),
    );
  });

  test("not when opened from the home screen", async () => {
    asBrowser(IPHONE_SAFARI, true);
    const pwa = await loadPwa();

    expect(
      renderHook(() => pwa.useAddToHomeScreen()).result.current.isShown,
    ).toBe(false);
  });

  test("not in the other browsers", async () => {
    asBrowser(
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
    );
    const pwa = await loadPwa();

    expect(
      renderHook(() => pwa.useAddToHomeScreen()).result.current.isShown,
    ).toBe(false);
  });

  test("closed, it stays closed in this browser", async () => {
    asBrowser(IPHONE_SAFARI);
    const pwa = await loadPwa();
    const hint = renderHook(() => pwa.useAddToHomeScreen());

    act(() => hint.result.current.dismiss());
    expect(hint.result.current.isShown).toBe(false);
    expect(localStorage.getItem(pwa.ADD_TO_HOME_SCREEN_DISMISSED)).toBe("1");

    vi.resetModules();
    const next = await loadPwa();
    expect(
      renderHook(() => next.useAddToHomeScreen()).result.current.isShown,
    ).toBe(false);
  });
});
