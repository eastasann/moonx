import { screen, waitFor } from "@testing-library/react";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Hold sends the reason with the last decision it saw, shows the toast and goes to 13", async () => {
  const { api, router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("hold"),
  });
  await fillDecision("Hold", "  Wait for the permit  ");
  pressRecord();
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(decisionPosts(api).map((c) => c.body)).toEqual([
    { value: "hold", reason: "Wait for the permit", basedOnDecisionId: LAST_ID },
  ]);
  expect(await screen.findByText("Decision recorded")).toBeInTheDocument();
  expect(screen.queryByText("Create a plan draft?")).toBeNull();
});
