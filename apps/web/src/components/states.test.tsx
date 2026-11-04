import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api";
import * as sentry from "../lib/sentry";
import {
  FailureState,
  LoadingBlock,
  SLOW_LOADING_MS,
  SlowLoadingState,
  useSlowLoading,
  useSlowRetry,
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

  test("a lost session shows nothing: no Something went wrong, no Ref (M9 or 2 takes it)", () => {
    const report = vi.spyOn(sentry, "reportError");
    const { container } = render(
      <FailureState
        error={
          new ApiError({ status: 401, code: "UNAUTHENTICATED", requestId })
        }
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).toBe("");
    expect(report).not.toHaveBeenCalled();
  });

  test("a rate limit: its wait and Retry, not unexpected (SDD 8.2「回数制限」)", () => {
    const report = vi.spyOn(sentry, "reportError");
    const onRetry = vi.fn();
    render(
      <FailureState
        error={
          new ApiError({
            status: 429,
            code: "RATE_LIMITED",
            requestId,
            detail: { retryAfterSeconds: 2700 },
          })
        }
        onRetry={onRetry}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Too many attempts. Try again in 45 minutes.",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/^Ref:/)).toBeNull();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
  });

  test("an API 4xx shown as unexpected goes to Sentry once, tagged with its request id (SDD 8.2・11章)", () => {
    const report = vi.spyOn(sentry, "reportError").mockReturnValue("event");
    const error = new ApiError({ status: 409, code: "BUSY", requestId });
    const { rerender } = render(
      <FailureState error={error} onRetry={() => {}} />,
    );
    rerender(<FailureState error={error} onRetry={() => {}} />);
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
    // The Ref is the request's, which finds the API's log line too.
    expect(screen.getByText("Ref: 8f14e45f")).toBeTruthy();
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(error, { requestId });
  });

  test("what is not shown as unexpected is not sent: the network, an API down, no access, not found", () => {
    const report = vi.spyOn(sentry, "reportError");
    for (const error of [
      new ApiError({ status: null, code: null, requestId: null }),
      new ApiError({ status: 503, code: "UPSTREAM_UNAVAILABLE", requestId }),
      new ApiError({ status: 403, code: "FORBIDDEN", requestId }),
      new ApiError({ status: 404, code: "NOT_FOUND", requestId }),
    ]) {
      render(<FailureState error={error} onRetry={() => {}} />).unmount();
    }
    expect(report).not.toHaveBeenCalled();
  });
});

function Loading({
  isLoading,
  onRetry = () => {},
}: {
  isLoading: boolean;
  onRetry?: () => void;
}) {
  const { isSlow, retry } = useSlowRetry(isLoading, onRetry);
  return isSlow ? <SlowLoadingState onRetry={retry} /> : null;
}

test("after 10 seconds of loading: Taking longer than usual; its Retry counts the 10 seconds again", () => {
  vi.useFakeTimers();
  const onRetry = vi.fn();
  const { rerender } = render(<Loading isLoading onRetry={onRetry} />);
  act(() => vi.advanceTimersByTime(SLOW_LOADING_MS - 1));
  expect(screen.queryByText("Taking longer than usual")).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(
    screen.getByRole("heading", { name: "Taking longer than usual" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(screen.queryByText("Taking longer than usual")).toBeNull();
  act(() => vi.advanceTimersByTime(SLOW_LOADING_MS - 1));
  expect(screen.queryByText("Taking longer than usual")).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(
    screen.getByRole("heading", { name: "Taking longer than usual" }),
  ).toBeTruthy();
  rerender(<Loading isLoading={false} onRetry={onRetry} />);
  expect(screen.queryByText("Taking longer than usual")).toBeNull();
});

/** A read's answer, given when the test says. */
function answer<T>() {
  let give: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    give = resolve;
  });
  return { promise, give };
}

/** A query whose reads answer only when the test says, and how many were asked. */
function heldQuery(key: string) {
  const answers = [answer<string>(), answer<string>(), answer<string>()];
  const held = {
    asked: 0,
    options: {
      queryKey: [key],
      queryFn: () => {
        held.asked += 1;
        return (answers[held.asked - 1] ?? answer<string>()).promise;
      },
    },
    answer: (index: number, value: string) =>
      act(async () => {
        answers[index]?.give(value);
        await vi.advanceTimersByTimeAsync(0);
      }),
  };
  return held;
}

function withQueries(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

/** A screen of one query: its data, else its skeleton, then the slow state. */
function Screen({
  options,
}: {
  options: ReturnType<typeof heldQuery>["options"];
}) {
  const query = useQuery(options);
  const { isSlow, retry } = useSlowLoading(query.isPending, [options]);
  if (query.data !== undefined) return <p>{query.data}</p>;
  return isSlow ? <SlowLoadingState onRetry={retry} /> : <p>Skeleton</p>;
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

test("Retry on Taking longer than usual drops the first read and asks again: the skeleton for 10 seconds anew, then the new answer; the dropped read's late answer changes nothing (6.0.6)", async () => {
  vi.useFakeTimers();
  const plan = heldQuery("plan");
  render(withQueries(<Screen options={plan.options} />));
  await wait(SLOW_LOADING_MS);
  expect(
    screen.getByRole("heading", { name: "Taking longer than usual" }),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await wait(0);
  expect(plan.asked).toBe(2);
  expect(screen.getByText("Skeleton")).toBeTruthy();
  await wait(SLOW_LOADING_MS - 1);
  expect(screen.queryByText("Taking longer than usual")).toBeNull();
  await wait(1);
  expect(
    screen.getByRole("heading", { name: "Taking longer than usual" }),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await wait(0);
  expect(plan.asked).toBe(3);
  await plan.answer(0, "First");
  expect(screen.queryByText("First")).toBeNull();
  expect(screen.getByText("Skeleton")).toBeTruthy();
  await plan.answer(2, "Third");
  expect(screen.getByText("Third")).toBeTruthy();
  await plan.answer(1, "Second");
  expect(screen.getByText("Third")).toBeTruthy();
  expect(screen.queryByText("Second")).toBeNull();
});

test("a modal's or panel's loading: its skeleton, then Taking longer than usual with Retry, which asks again and shows the skeleton anew (6.0.6)", async () => {
  vi.useFakeTimers();
  const conditions = heldQuery("conditions");
  function Block() {
    const query = useQuery(conditions.options);
    return query.data === undefined ? (
      <LoadingBlock waitsFor={[conditions.options]}>
        <p>Conditions</p>
      </LoadingBlock>
    ) : (
      <p>{query.data}</p>
    );
  }
  render(withQueries(<Block />));
  expect(screen.getByText("Conditions")).toBeTruthy();
  await wait(SLOW_LOADING_MS);
  expect(screen.queryByText("Conditions")).toBeNull();
  expect(
    screen.getByRole("heading", { level: 3, name: "Taking longer than usual" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await wait(0);
  expect(conditions.asked).toBe(2);
  expect(screen.getByText("Conditions")).toBeTruthy();
  await wait(SLOW_LOADING_MS - 1);
  expect(screen.queryByText("Taking longer than usual")).toBeNull();
  await wait(1);
  expect(
    screen.getByRole("heading", { level: 3, name: "Taking longer than usual" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await wait(0);
  await conditions.answer(2, "Launch if 20 orders");
  expect(screen.getByText("Launch if 20 orders")).toBeTruthy();
});
