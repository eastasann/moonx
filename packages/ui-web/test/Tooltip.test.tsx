import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Button } from "../src";
import { Tooltip } from "../src/components/Tooltip";

function Sample({ isDisabled }: { isDisabled?: boolean }) {
  return (
    <Tooltip content="Comments" delay={0} closeDelay={0} isDisabled={isDisabled}>
      <Button aria-label="Open comments">C</Button>
    </Tooltip>
  );
}

test("shows on hover and hides on leave, describing the trigger", async () => {
  render(<Sample />);
  const button = screen.getByRole("button", { name: "Open comments" });
  await userEvent.pointer({ keys: "[MouseLeft]", target: document.body });
  await userEvent.hover(button);
  const tip = await screen.findByRole("tooltip");
  expect(tip).toHaveTextContent("Comments");
  expect(button).toHaveAttribute("aria-describedby", tip.id);
  await userEvent.unhover(button);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("shows on keyboard focus and closes with Escape", async () => {
  render(<Sample />);
  await userEvent.tab();
  expect(screen.getByRole("button")).toHaveAttribute("data-focus-visible");
  expect(await screen.findByRole("tooltip")).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("isDisabled keeps it closed", async () => {
  render(<Sample isDisabled />);
  await userEvent.hover(screen.getByRole("button"));
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("an open tooltip has no axe violations", async () => {
  render(<Sample />);
  await userEvent.hover(screen.getByRole("button"));
  await screen.findByRole("tooltip");
  // The tooltip portals outside any landmark; the page-level `region` rule does not apply to it.
  const result = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  expect(result.violations).toEqual([]);
});
