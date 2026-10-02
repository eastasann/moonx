import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src";
import { Menu, MenuItem, MenuSection, MenuSeparator } from "../src/components/Menu";
import { expectNoAxeViolations } from "./axe";
import { mockNarrow } from "./matchMedia";
import { expectOverlayTriggerPressedLifecycle, expectPressedClearsOnLeave } from "./pressed";

function Sample(props: { onAction?: (key: React.Key) => void }) {
  return (
    <Menu trigger={<Button>Actions</Button>} onAction={props.onAction}>
      <MenuItem id="duplicate">Duplicate</MenuItem>
      <MenuItem id="archive" isDisabled>
        Archive
      </MenuItem>
      <MenuSeparator />
      <MenuSection title="Danger">
        <MenuItem id="delete" variant="negative">
          Delete
        </MenuItem>
      </MenuSection>
    </Menu>
  );
}

describe("Menu", () => {
  test("opens a menu with items, a section and a separator", async () => {
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    const menu = await screen.findByRole("menu", { name: "Actions" });
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
    expect(within(menu).getByRole("group", { name: "Danger" })).toBeInTheDocument();
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
    expect(menu.closest("[data-placement]")).not.toBeNull();
  });

  test("opens in a tray on a narrow viewport", async () => {
    mockNarrow(true);
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    const menu = await screen.findByRole("menu");
    expect(menu.closest("[data-placement]")).toBeNull();
  });

  test("arrow keys move focus, skip disabled items, Enter runs the action and closes", async () => {
    const onAction = vi.fn();
    render(<Sample onAction={onAction} />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const duplicate = await screen.findByRole("menuitem", { name: "Duplicate" });
    await waitFor(() => expect(duplicate).toHaveFocus());
    expect(duplicate).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onAction.mock.calls[0]?.[0]).toBe("delete");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("disabled items expose data-disabled and ignore presses", async () => {
    const onAction = vi.fn();
    render(<Sample onAction={onAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    const archive = await screen.findByRole("menuitem", { name: "Archive" });
    expect(archive).toHaveAttribute("data-disabled");
    await userEvent.click(archive);
    expect(onAction).not.toHaveBeenCalled();
  });

  test("hovering an item sets data-hovered and Escape closes the menu", async () => {
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    const duplicate = await screen.findByRole("menuitem", { name: "Duplicate" });
    await userEvent.hover(duplicate);
    expect(duplicate).toHaveAttribute("data-hovered");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  test.each(["pointer", "Enter", "Space"] as const)(
    "%s press sets data-pressed on the trigger, kept while open and removed on close",
    async (way) => {
      const user = userEvent.setup();
      render(<Sample />);
      await expectOverlayTriggerPressedLifecycle(
        screen.getByRole("button", { name: "Actions" }),
        user,
        way,
      );
    },
  );

  // Why: running an item closes the menu and unmounts the item, so the release cannot show the
  // attribute going away. The pointer leaves with the button held, which clears it on a node that
  // is still mounted; the key check stops at the held key for the same reason.
  test("an item is pressed while held and clears when the pointer leaves, without running", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Sample onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const duplicate = await screen.findByRole("menuitem", { name: "Duplicate" });
    await expectPressedClearsOnLeave(duplicate, user);
    expect(onAction).not.toHaveBeenCalled();
    duplicate.focus();
    await user.keyboard("{Enter>}");
    expect(duplicate).toHaveAttribute("data-pressed");
  });

  test("the trigger shows data-hovered on hover and clears on leaving", async () => {
    const user = userEvent.setup();
    render(<Sample />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.hover(trigger);
    expect(trigger).toHaveAttribute("data-hovered");
    await user.unhover(trigger);
    expect(trigger).not.toHaveAttribute("data-hovered");
  });

  test("selection mode marks the chosen item", async () => {
    render(
      <Menu trigger={<Button>View</Button>} selectionMode="single" defaultSelectedKeys={["cards"]}>
        <MenuItem id="cards">Cards</MenuItem>
        <MenuItem id="table">Table</MenuItem>
      </Menu>,
    );
    await userEvent.click(screen.getByRole("button", { name: "View" }));
    const cards = await screen.findByRole("menuitemradio", { name: "Cards" });
    expect(cards).toHaveAttribute("aria-checked", "true");
    expect(cards).toHaveAttribute("data-selected");
  });

  test("an open menu has no axe violations", async () => {
    render(<Sample />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    await screen.findByRole("menu");
    await expectNoAxeViolations(document.body);
  });
});
