import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { dismissByUser } from "../jest/bottom-sheet-mock";
import { Button, Text, Tray } from "../src";

test("the trigger opens the tray and its close function closes it", () => {
  const onOpenChange = jest.fn();
  render(
    <Tray trigger={<Button>Open</Button>} aria-label="Options" onOpenChange={onOpenChange}>
      {({ close }) => (
        <>
          <Text>Inside</Text>
          <Button onPress={close}>Done</Button>
        </>
      )}
    </Tray>,
  );
  expect(screen.queryByText("Inside")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Open" }));
  expect(screen.getByText("Inside")).toBeTruthy();
  expect(screen.getByLabelText("Options")).toBeTruthy();
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByText("Inside")).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

test("isOpen drives the tray without a trigger", () => {
  const { rerender } = render(
    <Tray aria-label="Options" isOpen={false}>
      <Text>Inside</Text>
    </Tray>,
  );
  expect(screen.queryByText("Inside")).toBeNull();
  rerender(
    <Tray aria-label="Options" isOpen>
      <Text>Inside</Text>
    </Tray>,
  );
  act(() => {});
  expect(screen.getByText("Inside")).toBeTruthy();
});

test("role names the content for assistive technology", () => {
  render(
    <Tray aria-label="Delete idea" role="alertdialog" isOpen>
      <Text>Sure?</Text>
    </Tray>,
  );
  expect(screen.getByLabelText("Delete idea").props.role).toBe("alertdialog");
});

test("a controlled tray that stays open is presented again after the sheet is dismissed", () => {
  const onOpenChange = jest.fn();
  render(
    <Tray aria-label="Options" isOpen onOpenChange={onOpenChange}>
      <Text>Inside</Text>
    </Tray>,
  );
  act(() => dismissByUser());
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(screen.getByText("Inside")).toBeTruthy();
});

test("an uncontrolled tray stays closed after the sheet is dismissed", () => {
  render(
    <Tray trigger={<Button>Open</Button>} aria-label="Options">
      <Text>Inside</Text>
    </Tray>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Open" }));
  act(() => dismissByUser());
  expect(screen.queryByText("Inside")).toBeNull();
});
