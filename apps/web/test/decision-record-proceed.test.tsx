import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  DECISIONS_PATH,
  decisionPosts,
  fillDecision,
  HOME_URL,
  LAST_ID,
  openDecide,
  pressRecord,
  recordedAnswer,
} from "./support-decision";

// One dialog per file: after a dialog test the next one in the same jsdom never returns.
afterEach(() => {
  vi.unstubAllGlobals();
});

test("Proceed asks about a plan draft, and Later goes to 13 without the modal", async () => {
  const { api, router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("proceed", true),
  });
  await fillDecision("Proceed", "Numbers hold up");
  pressRecord();
  await screen.findByRole("alertdialog", { name: "Create a plan draft?" });
  expect(decisionPosts(api).map((c) => c.body)).toEqual([
    { value: "proceed", reason: "Numbers hold up", basedOnDecisionId: LAST_ID },
  ]);
  expect(router.state.location.pathname).not.toBe(HOME_URL);
  fireEvent.click(screen.getByRole("button", { name: "Later" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(router.state.location.search).toEqual({});
});
