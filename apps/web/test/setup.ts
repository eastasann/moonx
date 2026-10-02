import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { autosave } from "../src/lib/autosave";
import { toasts } from "../src/lib/toast";

// jsdom has no matchMedia; the responsive components read it. Nothing matches: a wide window.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// The router scrolls to the top on navigation; jsdom does not implement it.
window.scrollTo = () => {};

afterEach(async () => {
  cleanup();
  // The queue and the item versions live in the module; a test must not inherit the last one's.
  await autosave.idle();
  await autosave.clear();
  // The toast queue is a module singleton too: a toast shown by one test must not appear in the next.
  for (const toast of [...toasts.visibleToasts]) toasts.close(toast.key);
});
