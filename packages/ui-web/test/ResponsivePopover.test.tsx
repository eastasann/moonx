import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogTrigger } from "react-aria-components";
import { Button } from "../src";
import { ResponsivePopover, useIsNarrow } from "../src/components/ResponsivePopover";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";
import { expectOverlayTriggerPressedLifecycle } from "./pressed";

function Sample() {
  return (
    <DialogTrigger>
      <Button>Open</Button>
      <ResponsivePopover>
        <Dialog aria-label="Options">Content</Dialog>
      </ResponsivePopover>
    </DialogTrigger>
  );
}

test("wide viewports get a popover anchored to the trigger", async () => {
  mockNarrow(false);
  render(<Sample />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Options" });
  expect(dialog.closest("[data-placement]")).not.toBeNull();
});

test("viewports narrower than the tablet breakpoint get a tray", async () => {
  mockNarrow(true);
  render(<Sample />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Options" });
  expect(dialog.closest("[data-placement]")).toBeNull();
});

test("the tray closes with Escape and returns focus to the trigger", async () => {
  mockNarrow(true);
  render(<Sample />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await userEvent.click(trigger);
  await screen.findByRole("dialog");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(trigger).toHaveFocus());
});

test.each(["pointer", "Enter", "Space"] as const)(
  "%s press sets data-pressed on the trigger, kept while open and removed on close",
  async (way) => {
    const user = userEvent.setup();
    render(<Sample />);
    await expectOverlayTriggerPressedLifecycle(
      screen.getByRole("button", { name: "Open" }),
      user,
      way,
    );
  },
);

test("keyboard focus shows data-focus-visible on the trigger, a pointer click does not", async () => {
  const user = userEvent.setup();
  render(<Sample />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await user.tab();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("data-focus-visible");
  await user.tab();
  expect(trigger).not.toHaveAttribute("data-focus-visible");
  await user.click(trigger);
  await screen.findByRole("dialog");
  await user.click(document.body);
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).not.toHaveAttribute("data-focus-visible");
});

test("the trigger shows data-hovered on hover and clears on leaving, narrow and wide", async () => {
  const user = userEvent.setup();
  render(<Sample />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await user.hover(trigger);
  expect(trigger).toHaveAttribute("data-hovered");
  await user.unhover(trigger);
  expect(trigger).not.toHaveAttribute("data-hovered");
});

test("an open popover has no axe violations", async () => {
  mockNarrow(false);
  render(<Sample />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("dialog");
  await expectNoAxeViolations(document.body);
});

test("useIsNarrow follows the media query", () => {
  mockNarrow(true);
  function Probe() {
    return <span>{useIsNarrow() ? "narrow" : "wide"}</span>;
  }
  render(<Probe />);
  expect(screen.getByText("narrow")).toBeInTheDocument();
});
