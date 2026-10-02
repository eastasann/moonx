import { fireEvent, screen, waitFor } from "@testing-library/react";
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

test("Create draft goes to 13 with the create-plan modal in the URL", async () => {
  const { router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("proceed", true),
  });
  await fillDecision("Proceed", "Numbers hold up");
  pressRecord();
  await screen.findByRole("alertdialog", { name: "Create a plan draft?" });
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(router.state.location.search).toEqual({ modal: "create-plan" });
});
