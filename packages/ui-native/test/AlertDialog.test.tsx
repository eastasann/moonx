import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AlertDialog } from "../src/components/AlertDialog";
import { Button } from "../src/components/Button";

const sample = (props: Partial<React.ComponentProps<typeof AlertDialog>> = {}) => (
  <AlertDialog
    trigger={<Button>Delete idea</Button>}
    title="Delete this idea?"
    primaryActionLabel="Delete"
    cancelLabel="Cancel"
    {...props}
  >
    This cannot be undone.
  </AlertDialog>
);

const open = () => fireEvent.press(screen.getByRole("button", { name: "Delete idea" }));

test("opens a tray with the title, message, cancel and confirm and no close button", () => {
  render(sample());
  expect(screen.queryByText("This cannot be undone.")).toBeNull();
  open();
  expect(screen.getByTestId("bottom-sheet")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Delete this idea?" })).toBeTruthy();
  expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  expect(screen.getAllByRole("button")).toHaveLength(3);
});

test("confirm calls onPrimaryAction once, closes and is not a cancel", () => {
  const onPrimaryAction = jest.fn();
  const onCancel = jest.fn();
  render(sample({ onPrimaryAction, onCancel }));
  open();
  fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
  expect(screen.queryByText("This cannot be undone.")).toBeNull();
});

test("cancel calls onCancel once and closes", () => {
  const onPrimaryAction = jest.fn();
  const onCancel = jest.fn();
  render(sample({ onPrimaryAction, onCancel }));
  open();
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onPrimaryAction).not.toHaveBeenCalled();
  expect(screen.queryByText("This cannot be undone.")).toBeNull();
});

test("a confirm followed by a second opening still reports a later cancel", () => {
  const onCancel = jest.fn();
  render(sample({ onCancel }));
  open();
  fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  open();
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("the negative variant gives the confirm button the negative color", () => {
  const color = () => screen.getByRole("button", { name: "Delete" }).props.style.backgroundColor;
  const { rerender } = render(sample({ defaultOpen: true, trigger: undefined }));
  act(() => {});
  const normal = color();
  rerender(sample({ variant: "negative", defaultOpen: true, trigger: undefined }));
  expect(color()).not.toBe(normal);
});

test("onOpenChange reports opening and closing", () => {
  const onOpenChange = jest.fn();
  render(sample({ onOpenChange }));
  open();
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

test("a controlled isOpen shows it without a trigger", () => {
  render(sample({ trigger: undefined, isOpen: true }));
  act(() => {});
  expect(screen.getByText("This cannot be undone.")).toBeTruthy();
});
