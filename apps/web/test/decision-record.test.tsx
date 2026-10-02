import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  DECISIONS_PATH,
  decisionPosts,
  fillDecision,
  HOME_URL,
  LAST_ID,
  makeEmptyContext,
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
  await pressRecord();
  await screen.findByRole("alertdialog", { name: "Create a plan draft?" });
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(router.state.location.search).toEqual({ modal: "create-plan" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Drop on an idea with no earlier decision sends a null base and goes to 13", async () => {
  const { api, router } = await openDecide(
    { [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("drop") },
    { context: makeEmptyContext() },
  );
  await fillDecision("Drop", "No demand", 6);
  await pressRecord();
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(decisionPosts(api).map((c) => c.body)).toEqual([
    { value: "drop", reason: "No demand", basedOnDecisionId: null },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Hold sends the reason with the last decision it saw, shows the toast and goes to 13", async () => {
  const { api, router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("hold"),
  });
  await fillDecision("Hold", "  Wait for the permit  ");
  await pressRecord();
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(decisionPosts(api).map((c) => c.body)).toEqual([
    { value: "hold", reason: "Wait for the permit", basedOnDecisionId: LAST_ID },
  ]);
  expect(await screen.findByText("Decision recorded")).toBeInTheDocument();
  expect(screen.queryByText("Create a plan draft?")).toBeNull();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Proceed without canCreatePlan skips the question and goes to 13", async () => {
  const { router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("proceed", false),
  });
  await fillDecision("Proceed", "Numbers hold up");
  await pressRecord();
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(screen.queryByText("Create a plan draft?")).toBeNull();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Proceed asks about a plan draft, and Later goes to 13 without the modal", async () => {
  const { api, router } = await openDecide({
    [`POST ${DECISIONS_PATH}`]: () => recordedAnswer("proceed", true),
  });
  await fillDecision("Proceed", "Numbers hold up");
  await pressRecord();
  await screen.findByRole("alertdialog", { name: "Create a plan draft?" });
  expect(decisionPosts(api).map((c) => c.body)).toEqual([
    { value: "proceed", reason: "Numbers hold up", basedOnDecisionId: LAST_ID },
  ]);
  expect(router.state.location.pathname).not.toBe(HOME_URL);
  await userEvent.click(screen.getByRole("button", { name: "Later" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(HOME_URL));
  expect(router.state.location.search).toEqual({});
});
