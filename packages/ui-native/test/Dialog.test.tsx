import { DIALOG_SIZES } from "@moonx/ui-tokens";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Button } from "../src/components/Button";
import { Dialog } from "../src/components/Dialog";

afterEach(resetMockUnistyles);

const sample = (props: Partial<React.ComponentProps<typeof Dialog>> = {}) => (
  <Dialog
    trigger={<Button>Open</Button>}
    title="Edit idea"
    closeLabel="Close"
    actions={({ close }) => <Button onPress={close}>Save</Button>}
    {...props}
  >
    <Text>Body text</Text>
  </Dialog>
);

const open = () => fireEvent.press(screen.getByRole("button", { name: "Open" }));

test.each(DIALOG_SIZES)(
  "size %s opens from the trigger with a heading, body and actions",
  (size) => {
    render(sample({ size }));
    expect(screen.queryByText("Body text")).toBeNull();
    open();
    expect(screen.getByRole("heading", { name: "Edit idea" })).toBeTruthy();
    expect(screen.getByText("Body text")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByLabelText("Edit idea")).toBeTruthy();
  },
);

test.each(["small", "medium", "large"] as const)("%s opens in the bottom tray", (size) => {
  render(sample({ size }));
  open();
  expect(screen.getByTestId("bottom-sheet")).toBeTruthy();
});

test("fullscreen opens a full-screen sheet, not the tray", async () => {
  render(sample({ size: "fullscreen" }));
  await act(async () => {});
  open();
  expect(screen.queryByTestId("bottom-sheet")).toBeNull();
  expect(screen.getByText("Body text")).toBeTruthy();
});

test.each(["medium", "fullscreen"] as const)(
  "the close button (%s) is a touch target that closes",
  (size) => {
    const onOpenChange = jest.fn();
    render(sample({ size, onOpenChange }));
    open();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(close.props.style.minWidth).toBeGreaterThanOrEqual(44);
    fireEvent.press(close);
    expect(screen.queryByText("Body text")).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  },
);

test("an action can close through the close function", () => {
  render(sample());
  open();
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(screen.queryByText("Body text")).toBeNull();
});

test("children can be a function of close", () => {
  render(
    <Dialog trigger={<Button>Open</Button>} title="T" closeLabel="Close">
      {({ close }) => <Button onPress={close}>Done</Button>}
    </Dialog>,
  );
  open();
  fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
});

test("isCloseHidden leaves out the close button", () => {
  render(sample({ isCloseHidden: true }));
  open();
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
});

test("string children are wrapped in text and the footer is left out without actions", () => {
  render(
    <Dialog trigger={<Button>Open</Button>} title="T" closeLabel="Close">
      Plain
    </Dialog>,
  );
  open();
  expect(screen.getByText("Plain")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

test("isOpen controls it without a trigger and onOpenChange reports", () => {
  const { rerender } = render(sample({ trigger: undefined, isOpen: false }));
  expect(screen.queryByText("Body text")).toBeNull();
  rerender(sample({ trigger: undefined, isOpen: true }));
  act(() => {});
  expect(screen.getByText("Body text")).toBeTruthy();
});

test("defaultOpen starts a fullscreen dialog open", async () => {
  render(sample({ trigger: undefined, size: "fullscreen", defaultOpen: true }));
  await act(async () => {});
  expect(screen.getByText("Body text")).toBeTruthy();
});

test("the fullscreen sheet follows the dark theme", async () => {
  const dialog = () => sample({ size: "fullscreen", trigger: undefined, defaultOpen: true });
  const { rerender } = render(dialog());
  await act(async () => {});
  const title = () => {
    const style = screen.getByRole("heading").props.style;
    return (Array.isArray(style) ? Object.assign({}, ...style) : style).color;
  };
  const light = title();
  act(() => mockUnistyles({ theme: "dark" }));
  rerender(dialog());
  expect(title()).not.toBe(light);
});
