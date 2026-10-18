import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api";
import * as sentry from "../lib/sentry";
import {
  FailureState,
  SLOW_LOADING_MS,
  SlowLoadingState,
  useIsSlow,
} from "./states";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const requestId = "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c";

const setOnline = (isOnline: boolean) =>
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(isOnline);

describe("FailureState (design-spec 6.0.6, SDD 8.2)", () => {
  test("the network, online: Couldn't load this page and Retry", () => {
    setOnline(true);
    const onRetry = vi.fn();
    render(
      <FailureState
        error={new ApiError({ status: null, code: null, requestId: null })}
        onRetry={onRetry}
      />,
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Couldn't load this page",
      }),
    ).toBeTruthy();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  test("the network, offline: the page cannot open until reconnected", () => {
    setOnline(false);
    render(
      <FailureState
        error={new ApiError({ status: null, code: null, requestId: null })}
        onRetry={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "You're offline. Connect to the internet to open this page.",
      }),
    ).toBeTruthy();
  });

  test("an API that is not up reads as a failure to load", () => {
    render(
      <FailureState
        error={
          new ApiError({
            status: 503,
            code: "UPSTREAM_UNAVAILABLE",
            requestId,
          })
        }
        onRetry={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Couldn't load this page" }),
    ).toBeTruthy();
  });

  test("no access and not found lead to the dashboard", () => {
    const { unmount } = render(
      <FailureState
        error={new ApiError({ status: 403, code: "NO_ACCESS", requestId })}
        onRetry={() => {}}
        dashboardHref="/w/1"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "You don't have access to this" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Go to Dashboard" })
        .getAttribute("href"),
    ).toBe("/w/1");
    unmount();
    render(
      <FailureState
        error={new ApiError({ status: 404, code: "NOT_FOUND", requestId })}
        onRetry={() => {}}
        dashboardHref="/w/1"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Not found. Check the link." }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toBeTruthy();
  });

  test("the API's unexpected error shows its request id as Ref, not reported again", () => {
    const report = vi.spyOn(sentry, "reportError");
    render(
      <FailureState
        error={new ApiError({ status: 500, code: "INTERNAL", requestId })}
        onRetry={() => {}}
        headingLevel={3}
        size="S"
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Something went wrong" }),
    ).toBeTruthy();
    expect(screen.getByText("Ref: 8f14e45f")).toBeTruthy();
    expect(report).not.toHaveBeenCalled();
  });

  test("the Web's own failure is reported once, its event id the Ref", () => {
    const report = vi
      .spyOn(sentry, "reportError")
      .mockReturnValue("3f2a9c1d0b8e4f5aa1b2c3d4e5f6a7b8");
    const error = new TypeError("boom");
    const { rerender } = render(
      <FailureState error={error} onRetry={() => {}} />,
    );
    rerender(<FailureState error={error} onRetry={() => {}} />);
    expect(screen.getByText("Ref: 3f2a9c1d")).toBeTruthy();
    expect(report).toHaveBeenCalledOnce();
  });

  test("without Sentry there is no Ref", () => {
    vi.spyOn(sentry, "reportError").mockReturnValue(null);
    render(<FailureState error={new Error("boom")} onRetry={() => {}} />);
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
    expect(screen.queryByText(/^Ref:/)).toBeNull();
  });
});

function Loading({ isLoading }: { isLoading: boolean }) {
  const isSlow = useIsSlow(isLoading);
  return isSlow ? <SlowLoadingState onRetry={() => {}} /> : null;
}

test("after 10 seconds of loading: Taking longer than usual", () => {
  vi.useFakeTimers();
  const { rerender } = render(<Loading isLoading />);
  act(() => vi.advanceTimersByTime(SLOW_LOADING_MS - 1));
  expect(screen.queryByText("Taking longer than usual")).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(
    screen.getByRole("heading", { name: "Taking longer than usual" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  rerender(<Loading isLoading={false} />);
  expect(screen.queryByText("Taking longer than usual")).toBeNull();
});
