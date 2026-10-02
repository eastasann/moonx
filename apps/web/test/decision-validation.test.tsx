import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  decisionPosts,
  fillDecision,
  openDecide,
  pressRecord,
  waitForForm,
} from "./support-decision";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("nothing is recorded without a choice or a reason", async () => {
  const { api } = await openDecide();
  await waitForForm();
  await screen.findByRole("heading", { name: "Checks — 2 missing" });
  await pressRecord();
  expect(await screen.findAllByText("Required")).toHaveLength(2);
  await userEvent.click(screen.getByRole("radio", { name: "Hold" }));
  await userEvent.type(screen.getByRole("textbox", { name: /^Why\?/ }), "   ");
  await pressRecord();
  expect(await screen.findAllByText("Required")).toHaveLength(1);
  expect(decisionPosts(api)).toHaveLength(0);
});

test("a reason over 5000 characters is refused", async () => {
  const { api } = await openDecide();
  await fillDecision("Hold", "x".repeat(5001));
  await pressRecord();
  expect(await screen.findByText("Use at most 5000 characters")).toBeInTheDocument();
  expect(decisionPosts(api)).toHaveLength(0);
});

test("the note follows the chosen value", async () => {
  await openDecide();
  await waitForForm();
  expect(screen.queryByRole("note", { name: /not approval/ })).toBeNull();
  await userEvent.click(screen.getByRole("radio", { name: "Proceed" }));
  expect(
    screen.getByText("Proceed means it is worth planning — not approval to launch."),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Drop" }));
  expect(
    screen.getByText("Dropped ideas are hidden from lists by default. You can decide again later."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/not approval to launch/)).toBeNull();
  await userEvent.click(screen.getByRole("radio", { name: "Hold" }));
  expect(screen.queryByText(/hidden from lists/)).toBeNull();
});
