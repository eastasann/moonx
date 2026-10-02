import { isNotFound } from "@tanstack/react-router";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadRoute() {
  vi.resetModules();
  return (await import("../src/routes/dev.components")).Route;
}

function runBeforeLoad(route: Awaited<ReturnType<typeof loadRoute>>) {
  const beforeLoad = route.options.beforeLoad as () => unknown;
  return beforeLoad();
}

test("the component gallery route is not found in a production build", async () => {
  vi.stubEnv("DEV", false);
  const route = await loadRoute();
  let thrown: unknown;
  try {
    runBeforeLoad(route);
  } catch (error) {
    thrown = error;
  }
  expect(isNotFound(thrown)).toBe(true);
});

test("the component gallery route opens in development", async () => {
  vi.stubEnv("DEV", true);
  const route = await loadRoute();
  expect(() => runBeforeLoad(route)).not.toThrow();
});

test("the gallery is not loaded outside development", async () => {
  vi.stubEnv("DEV", false);
  const route = await loadRoute();
  const Component = route.options.component as () => unknown;
  expect(Component()).toBeNull();
});
