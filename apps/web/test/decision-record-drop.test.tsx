import { waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  DECISIONS_PATH,
  decisionPosts,
  fillDecision,
  HOME_URL,
  makeEmptyContext,
  openDecide,
  pressRecord,
  recordedAnswer,
} from "./support-decision";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Drop on an idea with no earlier decision sends a null base and goes to 13", async () => {
  const { api, router } = await openDecide(
    { [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("drop") },
    { context: makeEmptyContext() },
  );
  await fillDecision("Drop", "No demand", 6);
  pressRecord();
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(decisionPosts(api).map((c) => c.body)).toEqual([
    { value: "drop", reason: "No demand", basedOnDecisionId: null },
  ]);
});
