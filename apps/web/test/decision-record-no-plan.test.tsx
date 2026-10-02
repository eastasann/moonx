import { screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  DECISIONS_PATH,
  fillDecision,
  HOME_URL,
  openDecide,
  pressRecord,
  recordedAnswer,
} from "./support-decision";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Proceed without canCreatePlan skips the question and goes to 13", async () => {
  const { router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("proceed", false),
  });
  await fillDecision("Proceed", "Numbers hold up");
  pressRecord();
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(screen.queryByText("Create a plan draft?")).toBeNull();
});
