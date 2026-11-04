import {
  CancelledError,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import {
  askAgain,
  dropRouteReads,
  readThroughRetries,
  routeQueries,
} from "./query";

/** A read's answer, given when the test says. */
function answer<T>() {
  let give: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    give = resolve;
  });
  return { promise, give };
}

/** A read that answers only when the test says, and how many times it was asked. */
function heldRead(key: string) {
  const answers = [answer<string>(), answer<string>(), answer<string>()];
  const read = {
    asked: 0,
    options: {
      queryKey: [key],
      queryFn: () => {
        read.asked += 1;
        return (answers[read.asked - 1] ?? answer<string>()).promise;
      },
    },
    answer: (index: number, value: string) => answers[index]?.give(value),
  };
  return read;
}

const never = () => new Promise<string>(() => {});

/** Lets the answers given so far reach the cache. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("askAgain (design-spec 6.0.6: Retry on Taking longer than usual)", () => {
  test("drops a first read under way and asks again: what awaited it gets the new answer, and the dropped one's late answer is ignored", async () => {
    const queryClient = new QueryClient();
    const plan = heldRead("plan");
    const awaited = queryClient.fetchQuery(plan.options);
    askAgain(queryClient, [plan.options]);
    expect(plan.asked).toBe(2);

    plan.answer(1, "second");
    expect(await awaited).toBe("second");
    plan.answer(0, "first");
    await settle();
    expect(queryClient.getQueryData(["plan"])).toBe("second");
  });

  test("leaves a query with data, one not listed, and one not reading", async () => {
    const queryClient = new QueryClient();
    // Read before, now read again behind what it shows.
    queryClient.setQueryData(["shown"], "cached");
    let shownAsked = 0;
    void queryClient.fetchQuery({
      queryKey: ["shown"],
      queryFn: () => {
        shownAsked += 1;
        return never();
      },
    });
    // Another block's first read.
    const other = heldRead("other");
    void queryClient.fetchQuery(other.options);
    // A first read that failed: its Retry is the failure's.
    let failedAsked = 0;
    const failed = {
      queryKey: ["failed"],
      queryFn: () => {
        failedAsked += 1;
        return Promise.reject(new Error("down"));
      },
      retry: false,
    };
    await queryClient.prefetchQuery(failed);

    askAgain(queryClient, [{ queryKey: ["shown"] }, failed]);
    expect(shownAsked).toBe(1);
    expect(queryClient.getQueryState(["shown"])).toMatchObject({
      data: "cached",
      fetchStatus: "fetching",
    });
    expect(other.asked).toBe(1);
    expect(failedAsked).toBe(1);
    expect(queryClient.getQueryState(["failed"])?.status).toBe("error");
  });
});

describe("readThroughRetries (code that awaits a query a Retry may drop)", () => {
  test("two Retries in a row: what awaited the first read gets the last answer, which the cache keeps", async () => {
    const queryClient = new QueryClient();
    const plan = heldRead("plan");
    const awaited = readThroughRetries(queryClient, ["plan"], () =>
      queryClient.fetchQuery(plan.options),
    );
    askAgain(queryClient, [plan.options]);
    await settle();
    askAgain(queryClient, [plan.options]);
    await settle();
    expect(plan.asked).toBe(3);

    plan.answer(2, "third");
    expect(await awaited).toBe("third");
    expect(queryClient.getQueryData(["plan"])).toBe("third");
  });

  test("a read joined while a screen's is under way: one Retry rejects what awaits it, and through this it gets the new answer", async () => {
    const queryClient = new QueryClient();
    const plan = heldRead("plan");
    // The screen's useQuery starts the first read; code then joins it.
    const screenRead = new QueryObserver(queryClient, plan.options);
    const unsubscribe = screenRead.subscribe(() => {});
    const joined = queryClient.fetchQuery(plan.options);
    const awaited = readThroughRetries(queryClient, ["plan"], () =>
      queryClient.fetchQuery(plan.options),
    );
    expect(plan.asked).toBe(1);

    askAgain(queryClient, [plan.options]);
    await expect(joined).rejects.toBeInstanceOf(CancelledError);
    await expect(joined).rejects.toHaveProperty("silent", true);
    expect(plan.asked).toBe(2);
    plan.answer(1, "second");
    expect(await awaited).toBe("second");
    expect(screenRead.getCurrentResult().data).toBe("second");
    unsubscribe();
  });

  test("a read a route's Retry drops is read again", async () => {
    const queryClient = new QueryClient();
    const me = heldRead("me");
    const routeLoad = routeQueries(queryClient).ensureQueryData(me.options);
    const awaited = readThroughRetries(queryClient, ["me"], () =>
      queryClient.ensureQueryData(me.options),
    );
    dropRouteReads(queryClient);
    await expect(routeLoad).rejects.toBeInstanceOf(CancelledError);
    expect(me.asked).toBe(2);
    me.answer(1, "second");
    expect(await awaited).toBe("second");
  });

  test("a failure, and a query taken out of the cache, reach the caller", async () => {
    const queryClient = new QueryClient();
    const down = new Error("down");
    await expect(
      readThroughRetries(queryClient, ["failed"], () =>
        queryClient.fetchQuery({
          queryKey: ["failed"],
          queryFn: () => Promise.reject(down),
          retry: false,
        }),
      ),
    ).rejects.toBe(down);

    const me = heldRead("me");
    const awaited = readThroughRetries(queryClient, ["me"], () =>
      queryClient.fetchQuery(me.options),
    );
    queryClient.clear();
    await expect(awaited).rejects.toBeInstanceOf(CancelledError);
    expect(me.asked).toBe(1);
  });
});

describe("routeQueries and dropRouteReads (PendingScreen's Retry)", () => {
  test("a read a route's load awaits is dropped, and the load run again reads again; others are left", async () => {
    const queryClient = new QueryClient();
    const me = heldRead("me");
    // The load the Retry replaces: the router discards it.
    routeQueries(queryClient)
      .ensureQueryData(me.options)
      .catch(() => {});
    // A read no route's load awaits.
    const other = heldRead("other");
    void queryClient.fetchQuery(other.options);

    dropRouteReads(queryClient);
    const again = routeQueries(queryClient).ensureQueryData(me.options);
    expect(me.asked).toBe(2);
    expect(other.asked).toBe(1);
    expect(queryClient.getQueryState(["other"])?.fetchStatus).toBe("fetching");

    me.answer(1, "second");
    expect(await again).toBe("second");
    me.answer(0, "first");
    await settle();
    expect(queryClient.getQueryData(["me"])).toBe("second");

    // Settled, it is no longer the route's: a later read is not dropped.
    void queryClient.fetchQuery({ ...me.options, staleTime: 0 });
    expect(me.asked).toBe(3);
    dropRouteReads(queryClient);
    expect(queryClient.getQueryState(["me"])?.fetchStatus).toBe("fetching");
  });

  test("a read of data the load awaits afresh is dropped too", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["me"], "cached");
    const me = heldRead("me");
    routeQueries(queryClient)
      .fetchQuery({ ...me.options, staleTime: 0 })
      .catch(() => {});
    dropRouteReads(queryClient);
    expect(queryClient.getQueryState(["me"])).toMatchObject({
      data: "cached",
      fetchStatus: "idle",
    });
    const again = routeQueries(queryClient).fetchQuery({
      ...me.options,
      staleTime: 0,
    });
    expect(me.asked).toBe(2);
    me.answer(1, "fresh");
    expect(await again).toBe("fresh");
  });
});
