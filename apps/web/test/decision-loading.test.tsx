import { screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { decisionPosts, openDecide, waitForForm } from "./support-decision";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the inputs show with a skeleton for the materials, and recording waits for them", async () => {
  const { api } = await openDecide({}, { holdContext: true });
  await waitForForm();
  expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Proceed" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^Why\?/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Record decision" })).toBeDisabled();
  expect(decisionPosts(api)).toHaveLength(0);
});
