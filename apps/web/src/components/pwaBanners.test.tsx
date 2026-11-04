import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ServiceWorkerHost } from "../lib/pwa";
import { SKIP_WAITING } from "../lib/sw-messages";

// Each test is a fresh page: lib/pwa.ts keeps the page's worker and bands in the module.
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

function Bands({ use }: { use: () => ReactNode }) {
  return <>{use()}</>;
}

describe("the new version band (design-spec 6.0.6)", () => {
  async function withWaitingVersion() {
    const pwa = await import("../lib/pwa");
    const { useNewVersionBanner } = await import("./pwaBanners");
    const waiting = { postMessage: vi.fn() };
    const registration = Object.assign(new EventTarget(), {
      waiting,
      active: {},
      installing: null,
      update: vi.fn(async () => {}),
    });
    const host = {
      container: Object.assign(new EventTarget(), {
        controller: {},
        register: async () => registration,
      }),
      document: new EventTarget(),
      reload: vi.fn(),
      setInterval: () => 0,
    };
    await pwa.registerServiceWorker(host as unknown as ServiceWorkerHost);
    render(<Bands use={useNewVersionBanner} />);
    return { waiting };
  }

  test("tells of the new version, with Reload and Close", async () => {
    const { waiting } = await withWaitingVersion();

    expect(screen.getByRole("alert").textContent).toContain(
      "A new version of moonx is available.",
    );
    act(() => screen.getByRole("button", { name: "Reload" }).click());
    expect(waiting.postMessage).toHaveBeenCalledWith(SKIP_WAITING);

    act(() => screen.getByRole("button", { name: "Close" }).click());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("shows nothing while no new version waits", async () => {
    const { useNewVersionBanner } = await import("./pwaBanners");
    render(<Bands use={useNewVersionBanner} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the Home Screen band (design-spec 6.0.6)", () => {
  test("in iPhone's Safari: how to add moonx, and Close, which it remembers", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    );
    const { useAddToHomeScreenBanner } = await import("./pwaBanners");
    render(<Bands use={useAddToHomeScreenBanner} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Add moonx to your Home Screen: tap Share, then Add to Home Screen.",
    );
    act(() => screen.getByRole("button", { name: "Close" }).click());
    expect(screen.queryByRole("alert")).toBeNull();

    // The next page in this browser.
    vi.resetModules();
    const next = await import("./pwaBanners");
    render(<Bands use={next.useAddToHomeScreenBanner} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
