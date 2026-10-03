import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Button } from "../src/components/Button";
import { Popover } from "../src/components/Popover";

test("a trigger opens the popover as a named tray and string children are wrapped in text", () => {
  render(
    <Popover trigger={<Button>Info</Button>} aria-label="More info" placement="bottom start">
      Plain words
    </Popover>,
  );
  expect(screen.queryByText("Plain words")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Info" }));
  expect(screen.getByLabelText("More info")).toBeTruthy();
  expect(screen.getByText("Plain words")).toBeTruthy();
});

test("children can be a function of close", () => {
  const onOpenChange = jest.fn();
  render(
    <Popover trigger={<Button>Info</Button>} aria-label="More info" onOpenChange={onOpenChange}>
      {({ close }) => <Button onPress={close}>Got it</Button>}
    </Popover>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Info" }));
  fireEvent.press(screen.getByRole("button", { name: "Got it" }));
  expect(screen.queryByText("Got it")).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

test("isOpen controls it without a trigger and defaultOpen starts it open", () => {
  const { rerender } = render(
    <Popover aria-label="More info" isOpen={false}>
      <Text>Inside</Text>
    </Popover>,
  );
  expect(screen.queryByText("Inside")).toBeNull();
  rerender(
    <Popover aria-label="More info" isOpen>
      <Text>Inside</Text>
    </Popover>,
  );
  act(() => {});
  expect(screen.getByText("Inside")).toBeTruthy();
});

test("defaultOpen starts it open", () => {
  render(
    <Popover aria-label="Other" defaultOpen>
      <Text>Other inside</Text>
    </Popover>,
  );
  act(() => {});
  expect(screen.getByText("Other inside")).toBeTruthy();
});
