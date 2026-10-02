import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  changedAnswer,
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

test("a newer decision asks first, and confirming sends the same base with confirmNewer", async () => {
  const { api, router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: ({ body }) =>
      (body as { confirmNewer?: boolean }).confirmNewer ? recordedAnswer("drop") : changedAnswer(),
  });
  await fillDecision("Drop", "Too risky");
  pressRecord();
  expect(
    await screen.findByText("Kenji recorded Hold 2 min. ago. Record yours as well?"),
  ).toBeInTheDocument();
  expect(screen.getByText("“Need the permit first”")).toBeInTheDocument();
  expect(router.state.location.pathname).not.toBe(HOME_URL);
  expect(screen.queryByText("Couldn't record")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Record mine as well" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(decisionPosts(api).map((c) => c.body)).toEqual([
    { value: "drop", reason: "Too risky", basedOnDecisionId: LAST_ID },
    { value: "drop", reason: "Too risky", basedOnDecisionId: LAST_ID, confirmNewer: true },
  ]);
});
