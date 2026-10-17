import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageSquare } from "lucide-react";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as overlay from "../internal/overlay.css";
import { FocusPattern } from "../patterns/FocusPattern";
import { setPhoneWidth, settle } from "../test/helpers";
import { ActionButton } from "./ActionButton";
import { Button } from "./Button";
import * as buttonStyles from "./Button.css";
import { Checkbox } from "./Checkbox";
import { ComboBox } from "./ComboBox";
import { ContextualHelp } from "./ContextualHelp";
import { AlertDialog, Dialog, DialogTrigger } from "./Dialog";
import { ActionMenu, Menu, MenuItem, MenuTrigger } from "./Menu";
import { Picker } from "./Picker";
import { Popover } from "./Popover";
import { Radio, RadioGroup } from "./RadioGroup";
import { Switch } from "./Switch";
import { TextField } from "./TextField";
import { Tooltip, TooltipTrigger } from "./Tooltip";
import { Tray } from "./Tray";

/** The overlay frame an element sits in. */
const frameOf = (element: Element) => {
  for (const [name, className] of [
    ["tray", overlay.tray],
    ["sheet", overlay.sheet],
    ["centered", overlay.centeredFrame],
    ["popover", overlay.popover],
  ] as const) {
    if (element.closest(`.${className}`) !== null) return name;
  }
  return "none";
};

afterEach(() => {
  vi.useRealTimers();
});

describe("Dialog", () => {
  const open = async (size?: "S" | "M" | "L" | "fullscreen") => {
    const user = userEvent.setup();
    render(
      <DialogTrigger>
        <Button>Open</Button>
        <Dialog
          title="New idea"
          size={size}
          buttons={({ close }) => <Button onPress={close}>Create</Button>}
        >
          Body text
        </Dialog>
      </DialogTrigger>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    return { user, dialog: screen.getByRole("dialog", { name: "New idea" }) };
  };

  test("opens in the middle of the screen on tablet and wider, named by its title", async () => {
    const { dialog } = await open();
    expect(frameOf(dialog)).toBe("centered");
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe(
      "New idea",
    );
    expect(within(dialog).getByText("Body text")).toBeTruthy();
  });

  test.each([
    ["S", "tray"],
    ["M", "tray"],
    ["L", "sheet"],
    ["fullscreen", "sheet"],
  ] as const)(
    "on a phone, %s opens as a %s (design-spec 3.8)",
    async (size, form) => {
      setPhoneWidth();
      const { dialog } = await open(size);
      expect(frameOf(dialog)).toBe(form);
    },
  );

  test("fullscreen fills the window on a desktop too", async () => {
    const { dialog } = await open("fullscreen");
    expect(frameOf(dialog)).toBe("sheet");
  });

  test.each(["S", "M", "L"] as const)(
    "%s takes its own width on a desktop",
    async (size) => {
      const { dialog } = await open(size);
      expect(dialog.closest(`.${overlay.dialogWidth[size]}`)).not.toBeNull();
    },
  );

  test("Escape closes it and focus returns to the button that opened it", async () => {
    const { user } = await open();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open" }),
    );
  });

  test("the buttons get close", async () => {
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("isDismissable adds a close button; without it there is none", async () => {
    const user = userEvent.setup();
    render(
      <>
        <DialogTrigger>
          <Button>Plain</Button>
          <Dialog title="Plain">Body</Dialog>
        </DialogTrigger>
        <DialogTrigger>
          <Button>Dismissable</Button>
          <Dialog title="Dismissable" isDismissable>
            Body
          </Dialog>
        </DialogTrigger>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Plain" }));
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: "Close",
      }),
    ).toBeNull();
    await user.keyboard("{Escape}");
    await settle();
    await user.click(screen.getByRole("button", { name: "Dismissable" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Close",
      }),
    );
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("isKeyboardDismissDisabled keeps it open on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Held" isOpen isKeyboardDismissDisabled>
        Body
      </Dialog>,
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Held" })).toBeTruthy();
  });

  test("a screen can hold it open without a trigger", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog title="Conflict" isOpen onOpenChange={onOpenChange}>
        Body
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Conflict" })).toBeTruthy();
  });
});

describe("the density of a dialog (design-spec 4.4・4.5)", () => {
  test("M1〜M9 pass spacious: fields, Buttons and choices L; another Dialog stays M, even over a spacious screen", () => {
    render(
      <>
        <Dialog
          isOpen
          density="spacious"
          title="New idea"
          buttons={<Button>Create idea</Button>}
        >
          <TextField label="Idea name" />
          <Checkbox>Share with Kenji</Checkbox>
          <RadioGroup label="Go / No-Go">
            <Radio value="go">Launch</Radio>
          </RadioGroup>
          <Switch>Notify the team</Switch>
        </Dialog>
        <FocusPattern header={<h1>Decide</h1>}>
          <Dialog isOpen title="Edit competitor">
            <TextField label="Competitor name" />
            <Checkbox>Direct competitor</Checkbox>
            <RadioGroup label="Type">
              <Radio value="direct">Direct</Radio>
            </RadioGroup>
            <Switch>Show on the card</Switch>
          </Dialog>
        </FocusPattern>
        <TextField label="L field" size="L" />
        <TextField label="M field" size="M" />
        <Button size="L">L button</Button>
        <Checkbox size="L">L box</Checkbox>
        <Checkbox size="M">M box</Checkbox>
        <RadioGroup label="L radios" size="L">
          <Radio value="l">L radio</Radio>
        </RadioGroup>
        <RadioGroup label="M radios" size="M">
          <Radio value="m">M radio</Radio>
        </RadioGroup>
        <Switch size="L">L switch</Switch>
        <Switch size="M">M switch</Switch>
      </>,
    );
    const rowOf = (role: "checkbox" | "radio" | "switch", name: string) =>
      screen.getByRole(role, { name }).closest("label")?.className;
    expect(rowOf("checkbox", "Share with Kenji")).toBe(
      rowOf("checkbox", "L box"),
    );
    expect(rowOf("radio", "Launch")).toBe(rowOf("radio", "L radio"));
    expect(rowOf("switch", "Notify the team")).toBe(
      rowOf("switch", "L switch"),
    );
    expect(rowOf("checkbox", "Direct competitor")).toBe(
      rowOf("checkbox", "M box"),
    );
    expect(rowOf("radio", "Direct")).toBe(rowOf("radio", "M radio"));
    expect(rowOf("switch", "Show on the card")).toBe(
      rowOf("switch", "M switch"),
    );
    expect(rowOf("checkbox", "L box")).not.toBe(rowOf("checkbox", "M box"));
    const frameOf = (name: string) =>
      screen.getByRole("textbox", { name }).parentElement?.className;
    expect(frameOf("Idea name")).toBe(frameOf("L field"));
    expect(screen.getByRole("button", { name: "Create idea" }).className).toBe(
      screen.getByRole("button", { name: "L button" }).className,
    );
    expect(frameOf("Competitor name")).toBe(frameOf("M field"));
  });

  test("an AlertDialog opened from a spacious pattern keeps its buttons M", () => {
    render(
      <>
        <FocusPattern header={<h1>Decide</h1>}>
          <AlertDialog
            isOpen
            title="Discard the reason?"
            primaryActionLabel="Discard"
            cancelLabel="Keep"
          >
            The reason you wrote goes.
          </AlertDialog>
        </FocusPattern>
        <Button size="M" variant="secondary">
          M secondary
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Keep" }).className).toBe(
      screen.getByRole("button", { name: "M secondary" }).className,
    );
  });
});

describe("AlertDialog", () => {
  const renderAlert = (
    props: Partial<Parameters<typeof AlertDialog>[0]> = {},
  ) =>
    render(
      <DialogTrigger>
        <Button>Delete</Button>
        <AlertDialog
          title="Delete this row?"
          primaryActionLabel="Delete row"
          cancelLabel="Cancel"
          {...props}
        >
          It cannot be undone.
        </AlertDialog>
      </DialogTrigger>,
    );

  test("Escape is its Cancel: it closes, reports the cancel and returns focus", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onPrimaryAction = vi.fn();
    renderAlert({ onCancel, onPrimaryAction });
    const trigger = screen.getByRole("button", { name: "Delete" });
    await user.click(trigger);
    const alert = screen.getByRole("alertdialog", { name: "Delete this row?" });
    expect(frameOf(alert)).toBe("centered");
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  test("without a cancel button Escape does nothing; a press outside never closes it", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    renderAlert({ cancelLabel: undefined, onPrimaryAction });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onPrimaryAction).not.toHaveBeenCalled();
    await user.click(document.body);
    await settle();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  test("Escape a part inside takes (an open Picker's list) does not cancel it", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AlertDialog
        isOpen
        title="Change the role?"
        primaryActionLabel="Change"
        cancelLabel="Cancel"
        onCancel={onCancel}
      >
        <Picker
          label="Role"
          items={[
            { id: "member", label: "Member" },
            { id: "viewer", label: "Viewer" },
          ]}
        />
      </AlertDialog>,
    );
    await user.click(screen.getByRole("button", { name: /Role/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("Escape that closes a ComboBox's open list, is held down or ends a composition does not cancel it", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AlertDialog
        isOpen
        title="Reassign the task?"
        primaryActionLabel="Reassign"
        cancelLabel="Cancel"
        onCancel={onCancel}
      >
        <ComboBox
          label="Assignee"
          defaultValue="u1"
          items={[
            { id: "u1", label: "Ana Reyes" },
            { id: "u2", label: "Carla Santos" },
          ]}
        />
      </AlertDialog>,
    );
    // With a chosen item, React Aria lets Escape go on after closing the list.
    const field = screen.getByRole("combobox", { name: "Assignee" });
    await user.click(field);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: "Escape", repeat: true });
    // The Escape that ends an IME composition, as Safari reports it.
    fireEvent.keyDown(field, { key: "Escape", keyCode: 229 });
    await settle();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("on a phone it is a tray a press outside does not close, and Escape is its Cancel (design-spec 4.5)", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderAlert({ onCancel });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const alert = screen.getByRole("alertdialog");
    expect(frameOf(alert)).toBe("tray");
    await user.click(document.body);
    await settle();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("each button closes it and reports itself", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    const onSecondaryAction = vi.fn();
    const onCancel = vi.fn();
    renderAlert({
      onPrimaryAction,
      onSecondaryAction,
      onCancel,
      secondaryActionLabel: "Archive instead",
    });
    for (const [name, handler] of [
      ["Cancel", onCancel],
      ["Archive instead", onSecondaryAction],
      ["Delete row", onPrimaryAction],
    ] as const) {
      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(
        within(screen.getByRole("alertdialog")).getByRole("button", { name }),
      );
      await settle();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    }
  });

  test("destructive makes the primary action negative; others keep the ink", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAlert({ variant: "destructive" });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.getByRole("button", { name: "Delete row" }).className,
    ).toContain(buttonStyles.button({ variant: "negative" }));
    unmount();
    renderAlert({ variant: "error" });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.getByRole("button", { name: "Delete row" }).className,
    ).toContain(buttonStyles.button({ variant: "primary" }));
  });
});

describe("Popover and Tray", () => {
  const renderPopover = (size?: "S" | "M" | "L") =>
    render(
      <DialogTrigger>
        <Button>Show</Button>
        <Popover size={size} aria-label="Details">
          <button type="button">Inside</button>
        </Popover>
      </DialogTrigger>,
    );

  test("a popover on tablet and wider, a tray on a phone", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPopover();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(frameOf(screen.getByRole("dialog", { name: "Details" }))).toBe(
      "popover",
    );
    unmount();
    setPhoneWidth();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(frameOf(screen.getByRole("dialog", { name: "Details" }))).toBe(
      "tray",
    );
  });

  test.each(["S", "M", "L"] as const)(
    "size %s sets its width",
    async (size) => {
      const user = userEvent.setup();
      renderPopover(size);
      await user.click(screen.getByRole("button", { name: "Show" }));
      expect(
        screen.getByRole("dialog").closest(`.${overlay.popoverWidth[size]}`),
      ).not.toBeNull();
    },
  );

  test("Escape closes it and focus returns to its button", async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Show" }),
    );
  });

  test("on a phone the tray also returns focus to its button", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Show" }),
    );
  });

  test("Tray: a sheet at every width; isDismissable={false} ignores Escape", async () => {
    const user = userEvent.setup();
    render(
      <>
        <DialogTrigger>
          <Button>Loose</Button>
          <Tray aria-label="Loose tray">Content</Tray>
        </DialogTrigger>
        <DialogTrigger>
          <Button>Fixed</Button>
          <Tray aria-label="Fixed tray" isDismissable={false}>
            {({ close }) => (
              <Button onPress={close} variant="secondary">
                Done
              </Button>
            )}
          </Tray>
        </DialogTrigger>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Loose" }));
    expect(frameOf(screen.getByRole("dialog", { name: "Loose tray" }))).toBe(
      "tray",
    );
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Fixed" }));
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.getByRole("dialog", { name: "Fixed tray" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Menu and ActionMenu", () => {
  const renderMenu = (onAction = vi.fn()) => {
    render(
      <MenuTrigger>
        <Button variant="secondary">AI</Button>
        <Menu onAction={onAction}>
          <MenuItem id="export">Export for AI</MenuItem>
          <MenuItem id="import" description="Paste a reply">
            Import from AI
          </MenuItem>
          <MenuItem id="later" isDisabled>
            Later
          </MenuItem>
        </Menu>
      </MenuTrigger>,
    );
    return onAction;
  };

  test("opens a popover; choosing an item acts and closes it", async () => {
    const user = userEvent.setup();
    const onAction = renderMenu();
    await user.click(screen.getByRole("button", { name: "AI" }));
    const menu = screen.getByRole("menu");
    expect(frameOf(menu)).toBe("popover");
    expect(
      within(menu).getByRole("menuitem", { name: /Import from AI/ })
        .textContent,
    ).toBe("Import from AIPaste a reply");
    await user.click(screen.getByRole("menuitem", { name: /Import from AI/ }));
    await settle();
    expect(onAction.mock.calls[0]?.[0]).toBe("import");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a disabled item cannot be chosen", async () => {
    const user = userEvent.setup();
    const onAction = renderMenu();
    await user.click(screen.getByRole("button", { name: "AI" }));
    const later = screen.getByRole("menuitem", { name: "Later" });
    expect(later.getAttribute("aria-disabled")).toBe("true");
    await user.click(later);
    expect(onAction).not.toHaveBeenCalled();
  });

  test("on a phone the menu is a tray; choosing closes it", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    const onAction = renderMenu();
    await user.click(screen.getByRole("button", { name: "AI" }));
    const menu = screen.getByRole("menu");
    expect(frameOf(menu)).toBe("tray");
    await user.click(screen.getByRole("menuitem", { name: "Export for AI" }));
    await settle();
    expect(onAction.mock.calls[0]?.[0]).toBe("export");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("ActionMenu: the ⋯ button opens its items", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ActionMenu onAction={onAction}>
        <MenuItem id="duplicate">Duplicate</MenuItem>
        <MenuItem id="archive">Archive</MenuItem>
      </ActionMenu>,
    );
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(onAction.mock.calls[0]?.[0]).toBe("archive");
  });
});

describe("Tooltip", () => {
  const renderTooltip = (onPress = vi.fn()) => {
    render(
      <TooltipTrigger>
        <ActionButton aria-label="Comments" onPress={onPress}>
          <MessageSquare />
        </ActionButton>
        <Tooltip>Comments</Tooltip>
      </TooltipTrigger>,
    );
    return onPress;
  };

  test("keyboard focus shows it", async () => {
    const user = userEvent.setup();
    renderTooltip();
    await user.tab();
    expect(screen.getByRole("tooltip").textContent).toBe("Comments");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  const touch = (type: "pointerDown" | "pointerUp", element: Element) =>
    fireEvent[type](element, {
      pointerType: "touch",
      pointerId: 7,
      isPrimary: true,
      button: 0,
      buttons: type === "pointerDown" ? 1 : 0,
    });

  test("a tap presses the button and shows no tooltip", () => {
    vi.useFakeTimers();
    const onPress = renderTooltip();
    const button = screen.getByRole("button", { name: "Comments" });
    touch("pointerDown", button);
    act(() => vi.advanceTimersByTime(200));
    touch("pointerUp", button);
    act(() => vi.advanceTimersByTime(1000));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("a long press shows it instead of pressing; it hides after the finger lifts (4.5)", () => {
    vi.useFakeTimers();
    const onPress = renderTooltip();
    const button = screen.getByRole("button", { name: "Comments" });
    touch("pointerDown", button);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip").textContent).toBe("Comments");
    touch("pointerUp", button);
    expect(onPress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1400));
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("ContextualHelp", () => {
  test("a quiet icon button opening help in a popover, or a tray on a phone", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ContextualHelp title="Who pays?">Name one group.</ContextualHelp>,
    );
    await user.click(screen.getByRole("button", { name: "Help" }));
    const dialog = screen.getByRole("dialog", { name: "Who pays?" });
    expect(frameOf(dialog)).toBe("popover");
    expect(within(dialog).getByText("Name one group.")).toBeTruthy();
    unmount();
    setPhoneWidth();
    render(<ContextualHelp title="Who pays?">Name one group.</ContextualHelp>);
    await user.click(screen.getByRole("button", { name: "Help" }));
    expect(frameOf(screen.getByRole("dialog", { name: "Who pays?" }))).toBe(
      "tray",
    );
  });

  test("info names itself Information; a label shows beside the icon", () => {
    render(
      <>
        <ContextualHelp variant="info" title="Numbers">
          From validation.
        </ContextualHelp>
        <ContextualHelp label="Hint" title="Hint">
          Think of the last purchase.
        </ContextualHelp>
      </>,
    );
    expect(screen.getByRole("button", { name: "Information" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hint" }).textContent).toBe(
      "Hint",
    );
  });
});

describe("states and focus return of the overlays", () => {
  test("a menu item takes hover; a disabled one data-disabled", async () => {
    const user = userEvent.setup();
    render(
      <MenuTrigger>
        <Button>Open</Button>
        <Menu>
          <MenuItem id="a">Duplicate</MenuItem>
          <MenuItem id="b" isDisabled>
            Archive
          </MenuItem>
        </Menu>
      </MenuTrigger>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    const item = screen.getByRole("menuitem", { name: "Duplicate" });
    await user.hover(item);
    expect(item.hasAttribute("data-hovered")).toBe(true);
    expect(
      screen
        .getByRole("menuitem", { name: "Archive" })
        .hasAttribute("data-disabled"),
    ).toBe(true);
  });

  test("ActionMenu isDisabled disables its ⋯ button", () => {
    render(
      <ActionMenu isDisabled>
        <MenuItem id="a">A</MenuItem>
      </ActionMenu>,
    );
    expect(
      screen
        .getByRole("button", { name: "More actions" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("AlertDialog: a disabled primary action cannot be pressed", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    render(
      <AlertDialog
        isOpen
        title="Overwrite?"
        primaryActionLabel="Overwrite"
        secondaryActionLabel="Load theirs"
        isPrimaryActionDisabled
        isSecondaryActionDisabled
        onPrimaryAction={onPrimaryAction}
      >
        Body
      </AlertDialog>,
    );
    const primary = screen.getByRole("button", { name: "Overwrite" });
    expect(primary.hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Load theirs" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(primary);
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });

  test("AlertDialog: error and warning name their sign; the body describes the dialog", () => {
    const { unmount } = render(
      <AlertDialog
        isOpen
        variant="error"
        title="Something went wrong"
        primaryActionLabel="Retry"
      >
        Ref: 3f2a9c1d
      </AlertDialog>,
    );
    const alert = screen.getByRole("alertdialog", {
      name: /Something went wrong/,
    });
    expect(within(alert).getByRole("img", { name: "Alert" })).toBeTruthy();
    const body = document.getElementById(
      alert.getAttribute("aria-describedby") ?? "",
    );
    expect(body?.textContent).toBe("Ref: 3f2a9c1d");
    unmount();
    render(
      <AlertDialog
        isOpen
        variant="warning"
        title="Conflict"
        primaryActionLabel="OK"
      >
        Body
      </AlertDialog>,
    );
    expect(screen.getByRole("img", { name: "Alert" })).toBeTruthy();
  });

  test("AlertDialog L on a phone is still a tray (design-spec 4.5)", () => {
    setPhoneWidth();
    render(
      <AlertDialog isOpen size="L" title="Delete?" primaryActionLabel="Delete">
        Body
      </AlertDialog>,
    );
    expect(frameOf(screen.getByRole("alertdialog"))).toBe("tray");
  });

  test("ContextualHelp and Tray return focus to their button when closed", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ContextualHelp title="Who pays?">Name one group.</ContextualHelp>
        <DialogTrigger>
          <Button>Open tray</Button>
          <Tray aria-label="Sheet">Content</Tray>
        </DialogTrigger>
      </>,
    );
    for (const name of ["Help", "Open tray"]) {
      const trigger = screen.getByRole("button", { name });
      await user.click(trigger);
      expect(screen.getByRole("dialog")).toBeTruthy();
      await user.keyboard("{Escape}");
      await settle();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    }
  });

  test("Tooltip isDisabled shows nothing on keyboard focus or a long press", async () => {
    const user = userEvent.setup();
    render(
      <TooltipTrigger isDisabled>
        <ActionButton aria-label="Comments">
          <MessageSquare />
        </ActionButton>
        <Tooltip>Comments</Tooltip>
      </TooltipTrigger>,
    );
    await user.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByRole("button"), {
      pointerType: "touch",
      pointerId: 3,
      isPrimary: true,
    });
    act(() => vi.advanceTimersByTime(800));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("Tooltip long press, the finer cases", () => {
  const renderTwo = () =>
    render(
      <>
        <TooltipTrigger>
          <ActionButton aria-label="Comments">
            <MessageSquare />
          </ActionButton>
          <Tooltip>Comments tip</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger>
          <ActionButton aria-label="History">
            <MessageSquare />
          </ActionButton>
          <Tooltip>History tip</Tooltip>
        </TooltipTrigger>
      </>,
    );
  const press = (element: Element, id: number) =>
    fireEvent.pointerDown(element, {
      pointerType: "touch",
      pointerId: id,
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
  const lift = (element: Element, id: number) =>
    fireEvent.pointerUp(element, { pointerType: "touch", pointerId: id });

  test("sliding off the button before the threshold opens nothing", () => {
    vi.useFakeTimers();
    renderTwo();
    const button = screen.getByRole("button", { name: "Comments" });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 40, height: 40 }),
    );
    press(button, 4);
    fireEvent.pointerMove(button, {
      pointerType: "touch",
      pointerId: 4,
      clientX: 200,
      clientY: 200,
    });
    act(() => vi.advanceTimersByTime(800));
    expect(screen.queryByRole("tooltip")).toBeNull();
    lift(button, 4);
  });

  test("a press on the icon counts the whole button: drifting off the icon keeps it", () => {
    vi.useFakeTimers();
    renderTwo();
    const button = screen.getByRole("button", { name: "Comments" });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 44, height: 44 }),
    );
    const icon = button.querySelector("svg") as SVGElement;
    press(icon, 8);
    fireEvent.pointerMove(icon, {
      pointerType: "touch",
      pointerId: 8,
      clientX: 40,
      clientY: 40,
    });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByRole("tooltip").textContent).toBe("Comments tip");
    lift(icon, 8);
  });

  test("a second long press closes the first one's tooltip", () => {
    vi.useFakeTimers();
    renderTwo();
    const comments = screen.getByRole("button", { name: "Comments" });
    const history = screen.getByRole("button", { name: "History" });
    press(comments, 5);
    act(() => vi.advanceTimersByTime(600));
    lift(comments, 5);
    expect(screen.getByRole("tooltip").textContent).toBe("Comments tip");
    press(history, 6);
    act(() => vi.advanceTimersByTime(600));
    expect(
      screen.getAllByRole("tooltip").map((tip) => tip.textContent),
    ).toEqual(["History tip"]);
    lift(history, 6);
  });
});
