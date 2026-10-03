import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Fragment } from "react";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Picker, PickerItem } from "../src/components/Picker";
import { styleOf } from "./fieldHelpers";

afterEach(resetMockUnistyles);

function Currency(props: Partial<React.ComponentProps<typeof Picker>>) {
  return (
    <Picker label="Currency" placeholder="Choose one" {...props}>
      <PickerItem id="php">Philippine peso</PickerItem>
      <Fragment key="more">
        <PickerItem id="usd">US dollar</PickerItem>
        <PickerItem id="jpy" isDisabled>
          Japanese yen
        </PickerItem>
      </Fragment>
    </Picker>
  );
}

const trigger = () => screen.getByRole("button", { name: "Currency" });

test.each(COMPONENT_SIZES)("the closed field is a button at least 44 high at size %s", (size) => {
  render(<Currency size={size} />);
  expect(styleOf(trigger(), "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  expect(trigger().props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.getByText("Choose one")).toBeTruthy();
  expect(screen.queryByRole("option")).toBeNull();
});

test("pressing opens a tray listing every item as a 44 high option", () => {
  render(<Currency />);
  fireEvent.press(trigger());
  expect(trigger().props.accessibilityState).toMatchObject({ expanded: true });
  const options = screen.getAllByRole("option");
  expect(options.map((o) => o.props.accessibilityState.selected)).toEqual([false, false, false]);
  for (const option of options) {
    expect(styleOf(option, "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  }
  // The field, the tray and its list all carry the field name.
  expect(screen.getAllByLabelText("Currency", { includeHiddenElements: true })).toHaveLength(3);
});

test("choosing an item reports its id, closes the tray and shows its text", () => {
  const onChange = jest.fn();
  render(<Currency onChange={onChange} />);
  fireEvent.press(trigger());
  fireEvent.press(screen.getByRole("option", { name: "US dollar" }));
  expect(onChange).toHaveBeenCalledWith("usd");
  expect(screen.queryByRole("option")).toBeNull();
  expect(screen.getByText("US dollar")).toBeTruthy();
  expect(trigger().props.accessibilityValue).toEqual({ text: "US dollar" });
});

test("the chosen row is marked selected when the tray reopens", () => {
  render(<Currency defaultValue="usd" />);
  fireEvent.press(trigger());
  const [php, usd] = screen.getAllByRole("option");
  expect(php?.props.accessibilityState).toMatchObject({ selected: false });
  expect(usd?.props.accessibilityState).toMatchObject({ selected: true });
});

test("a controlled value is shown and changes only through the screen", () => {
  const onChange = jest.fn();
  const { rerender } = render(<Currency value="php" onChange={onChange} />);
  expect(screen.getByText("Philippine peso")).toBeTruthy();
  fireEvent.press(trigger());
  fireEvent.press(screen.getByRole("option", { name: "US dollar" }));
  expect(onChange).toHaveBeenCalledWith("usd");
  expect(screen.getByText("Philippine peso")).toBeTruthy();
  rerender(<Currency value={null} onChange={onChange} />);
  expect(screen.getByText("Choose one")).toBeTruthy();
});

test("disabled items and disabledKeys cannot be chosen", () => {
  const onChange = jest.fn();
  render(<Currency onChange={onChange} disabledKeys={["usd"]} />);
  fireEvent.press(trigger());
  fireEvent.press(screen.getByRole("option", { name: "Japanese yen" }));
  fireEvent.press(screen.getByRole("option", { name: "US dollar" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("option", { name: "US dollar" }).props.accessibilityState).toMatchObject({
    disabled: true,
  });
});

test("a disabled picker does not open", () => {
  render(<Currency isDisabled />);
  fireEvent.press(trigger());
  expect(screen.queryByRole("option")).toBeNull();
  expect(trigger().props.accessibilityState).toMatchObject({ disabled: true });
});

test("openChange reports and a controlled isOpen opens the tray", () => {
  const onOpenChange = jest.fn();
  const { rerender } = render(<Currency onOpenChange={onOpenChange} />);
  fireEvent.press(trigger());
  expect(onOpenChange).toHaveBeenCalledWith(true);
  rerender(<Currency isOpen={false} />);
  rerender(<Currency isOpen />);
  expect(screen.getAllByRole("option")).toHaveLength(3);
});

test("the error shows while invalid and the label can be hidden", () => {
  render(<Currency isInvalid errorMessage="Pick a currency" isLabelHidden />);
  expect(screen.getByRole("alert")).toHaveTextContent("Pick a currency");
  expect(screen.queryByText("Currency")).toBeNull();
  expect(trigger()).toBeTruthy();
});

test("renders in the dark theme", () => {
  mockUnistyles({ theme: "dark" });
  render(<Currency defaultValue="php" />);
  fireEvent.press(trigger());
  expect(screen.getAllByRole("option")).toHaveLength(3);
});
