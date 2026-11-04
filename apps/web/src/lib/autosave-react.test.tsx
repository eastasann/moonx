import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { ApiError } from "./api";
import { createAutosave, RETRY_DELAYS_MS } from "./autosave";
import { AutosaveProvider } from "./autosave-react";

// ADR-021「離脱の確認」: the browser asks before the page goes while input is unsaved.

const leave = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test("closing or reloading the page asks while input is unsaved, and only then", () => {
  const autosave = createAutosave();
  render(
    <AutosaveProvider autosave={autosave}>
      <span />
    </AutosaveProvider>,
  );
  expect(leave()).toBe(false);
  autosave.change(
    {
      key: "idea:a",
      noun: "summary",
      send: () => new Promise(() => {}),
      loadTheirs: () => {},
    },
    1,
    { name: "Unsaved" },
  );
  expect(leave()).toBe(true);
  autosave.discardAll();
  expect(leave()).toBe(false);
});

test("a save failing for now stops being sent again once the app is gone, under StrictMode too", async () => {
  vi.useFakeTimers();
  try {
    const autosave = createAutosave();
    const send = vi.fn(async () => {
      throw new ApiError({
        status: 503,
        code: "UPSTREAM_UNAVAILABLE",
        requestId: null,
      });
    });
    const { unmount } = render(
      <StrictMode>
        <AutosaveProvider autosave={autosave}>
          <span />
        </AutosaveProvider>
      </StrictMode>,
    );
    autosave.change(
      { key: "idea:a", noun: "summary", send, loadTheirs: () => {} },
      1,
      { name: "Unsaved" },
    );
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] ?? 0);
    expect(send).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
