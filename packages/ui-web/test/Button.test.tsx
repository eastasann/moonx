import { BUTTON_VARIANTS, COMPONENT_SIZES } from "@moonx/ui-tokens";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

test.each(BUTTON_VARIANTS)("renders the %s variant as a named button", (variant) => {
  render(<Button variant={variant}>Save</Button>);
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});

test.each(COMPONENT_SIZES)("renders size %s as a named button", (size) => {
  render(<Button size={size}>Save</Button>);
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});

test("press handler fires and disabled blocks it", async () => {
  const onPress = vi.fn();
  const { rerender } = render(<Button onPress={onPress}>Save</Button>);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(
    <Button isDisabled onPress={onPress}>
      Save
    </Button>,
  );
  expect(screen.getByRole("button")).toHaveAttribute("data-disabled");
  await userEvent.click(screen.getByRole("button"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("hover is shown through data-hovered and clears on leaving", async () => {
  const user = userEvent.setup();
  render(<Button>Save</Button>);
  const button = screen.getByRole("button");
  await user.hover(button);
  expect(button).toHaveAttribute("data-hovered");
  await user.unhover(button);
  expect(button).not.toHaveAttribute("data-hovered");
});

test("pressed is set while held and removed on release, by pointer and keyboard", async () => {
  const user = userEvent.setup();
  render(<Button>Save</Button>);
  await expectPressedLifecycle(screen.getByRole("button"), user);
});

test("keyboard focus shows data-focus-visible, a pointer click does not", async () => {
  const user = userEvent.setup();
  render(<Button>Save</Button>);
  const button = screen.getByRole("button");
  await user.tab();
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute("data-focus-visible");
  await user.tab();
  expect(button).not.toHaveAttribute("data-focus-visible");
  await user.click(button);
  expect(button).not.toHaveAttribute("data-focus-visible");
});

test("Enter and Space each press once", async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(<Button onPress={onPress}>Save</Button>);
  await user.tab();
  await user.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledTimes(1);
  await user.keyboard(" ");
  expect(onPress).toHaveBeenCalledTimes(2);
});

test("a disabled button is skipped by Tab and ignores keys", async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(
    <Button isDisabled onPress={onPress}>
      Save
    </Button>,
  );
  await user.tab();
  expect(screen.getByRole("button")).not.toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onPress).not.toHaveBeenCalled();
});

describe("isPending", () => {
  test("shows a spinner named by pendingLabel before the label", () => {
    render(
      <Button isPending pendingLabel="Saving">
        Save
      </Button>,
    );
    const button = screen.getByRole("button");
    const spinner = screen.getByRole("progressbar", { name: "Saving" });
    expect(button).toContainElement(spinner);
    expect(spinner).not.toHaveAttribute("aria-valuenow");
    expect(button.firstElementChild).toBe(spinner);
    expect(button.lastChild?.textContent).toBe("Save");
    expect(button).toHaveAttribute("data-pending");
  });

  test("has no spinner when it is not pending", () => {
    render(<Button>Save</Button>);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("ignores presses by pointer and keyboard and reports aria-disabled", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <Button isPending pendingLabel="Saving" onPress={onPress}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    await user.tab();
    await user.keyboard("{Enter} ");
    expect(onPress).not.toHaveBeenCalled();
  });

  test("a function child still receives the render props", () => {
    render(
      <Button isPending pendingLabel="Saving">
        {({ isPending }) => (isPending ? "Working" : "Save")}
      </Button>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Working");
  });

  test("pendingLabel is required while isPending", () => {
    // @ts-expect-error pendingLabel is missing
    const element = <Button isPending>Save</Button>;
    expect(element).toBeTruthy();
  });
});

test.each([
  ["idle", {}],
  ["disabled", { isDisabled: true }],
  ["pending", { isPending: true, pendingLabel: "Saving" } as const],
])("has no axe violations (%s)", async (_name, props) => {
  const { container } = render(<Button {...props}>Save</Button>);
  await expectNoAxeViolations(container);
});
