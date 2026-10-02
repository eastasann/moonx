import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  DECISIONS_PATH,
  decisionPosts,
  fillDecision,
  HOME_URL,
  openDecide,
  pressRecord,
  recordedAnswer,
} from "./support-decision";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a failed record keeps the input and Retry sends the same decision again", async () => {
  let attempts = 0;
  const { api, router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: () => {
      attempts += 1;
      return attempts === 1
        ? {
            status: 500,
            body: { error: { code: "INTERNAL", message: "boom", requestId: "abcdef12-0" } },
          }
        : recordedAnswer("hold");
    },
  });
  await fillDecision("Hold", "Wait for the permit");
  await pressRecord();
  expect(await screen.findByText("Couldn't record")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^Why\?/ })).toHaveValue("Wait for the permit");
  expect(screen.getByRole("radio", { name: "Hold" })).toBeChecked();
  expect(router.state.location.pathname).not.toBe(HOME_URL);

  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  const bodies = decisionPosts(api).map((c) => c.body);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});
