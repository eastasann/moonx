import { expect, test } from "./fixtures";

// ADR-031 on Vite's dev server, which the other specs use: the manifest and icons are
// served, so the pages' links to them resolve, and no service worker is registered.
// The production build's side is pwa.spec.ts.

test("the dev server serves the manifest and the icons", async ({
  request,
}) => {
  for (const [path, type] of [
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/icons/favicon.png", "image/png"],
    ["/icons/icon.svg", "image/svg+xml"],
    ["/icons/apple-touch-icon.png", "image/png"],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toBe(type);
  }
});

test("the dev server's pages register no service worker", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  // Registration would follow the load event (src/client.tsx).
  await page.waitForLoadState("load");

  expect(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
  ).toBe(0);
});
