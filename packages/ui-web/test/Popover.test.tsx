import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src";
import { Popover } from "../src/components/Popover";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";
import { expectOverlayTriggerPressedLifecycle } from "./pressed";

function Sample() {
  return (
    <Popover trigger={<Button>Open</Button>} aria-label="Details">
      {({ close }) => <Button onPress={close}>Done</Button>}
    </Popover>
  );
}

test("wide viewports get a popover named by aria-label", async () => {
  render(<Sample />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Details" });
  expect(dialog.closest("[data-placement]")).not.toBeNull();
});

test("narrow viewports get a tray", async () => {
  mockNarrow(true);
  render(<Sample />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Details" });
  expect(dialog.closest("[data-placement]")).toBeNull();
});

test("opens with Enter, closes with the close render prop and restores focus", async () => {
  render(<Sample />);
  const trigger = screen.getByRole("button", { name: "Open" });
  trigger.focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(await screen.findByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("the trigger exposes hover and disabled state", async () => {
  const { rerender } = render(<Sample />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await userEvent.hover(trigger);
  expect(trigger).toHaveAttribute("data-hovered");
  rerender(
    <Popover trigger={<Button isDisabled>Open</Button>} aria-label="Details">
      x
    </Popover>,
  );
  expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute("data-disabled");
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
  await user.click(await screen.findByRole("button", { name: "Done" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).not.toHaveAttribute("data-focus-visible");
});

test("an open popover has no axe violations", async () => {
  render(<Sample />);
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("dialog");
  await expectNoAxeViolations(document.body);
});
