import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextInput } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { ComboBox, ComboBoxItem, type ComboBoxProps } from "../src/components/ComboBox";
import { styleOf } from "./fieldHelpers";

afterEach(resetMockUnistyles);

type OwnerProps = Omit<Partial<ComboBoxProps>, "allowsCustomValue" | "customValueLabel"> & {
  custom?: boolean;
};

function Owner({ custom, ...props }: OwnerProps) {
  const items = [
    <ComboBoxItem key="ana" id="ana">
      Ana Reyes
    </ComboBoxItem>,
    <ComboBoxItem key="ben" id="ben">
      Ben Cruz
    </ComboBoxItem>,
    <ComboBoxItem key="ana2" id="ana2">
      Anabel Lim
    </ComboBoxItem>,
  ];
  return custom ? (
    <ComboBox
      label="Owner"
      openLabel="Show members"
      emptyMessage="No match"
      placeholder="Pick someone"
      allowsCustomValue
      customValueLabel="Use this text"
      {...props}
    >
      {items}
    </ComboBox>
  ) : (
    <ComboBox
      label="Owner"
      openLabel="Show members"
      emptyMessage="No match"
      placeholder="Pick someone"
      {...props}
    >
      {items}
    </ComboBox>
  );
}

const field = () => screen.getByRole("combobox", { name: "Owner" });
const search = () => screen.UNSAFE_getByType(TextInput);
const open = () => fireEvent.press(field());

test.each(COMPONENT_SIZES)("closed, it is a combobox at least 44 high at size %s", (size) => {
  render(<Owner size={size} />);
  expect(styleOf(field(), "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  expect(field().props.accessibilityState).toMatchObject({ expanded: false });
  expect(field().props.accessibilityHint).toBe("Show members");
  expect(screen.getByText("Pick someone")).toBeTruthy();
  expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
});

test("pressing opens a tray with its own input and every item", () => {
  render(<Owner />);
  open();
  expect(field().props.accessibilityState).toMatchObject({ expanded: true });
  expect(search().props.value).toBe("");
  expect(screen.getAllByRole("option")).toHaveLength(3);
  for (const option of screen.getAllByRole("option")) {
    expect(styleOf(option, "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  }
});

test("the tray's input filters the list", () => {
  render(<Owner />);
  open();
  fireEvent.changeText(search(), "ANA");
  expect(screen.getAllByRole("option")).toHaveLength(2);
  expect(screen.getByRole("option", { name: "Ana Reyes" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Anabel Lim" })).toBeTruthy();
  fireEvent.changeText(search(), "zzz");
  expect(screen.queryByRole("option")).toBeNull();
  expect(screen.getByText("No match")).toBeTruthy();
});

test("choosing an item reports its id and text, closes and shows the text", () => {
  const onChange = jest.fn();
  const onInputChange = jest.fn();
  render(<Owner onChange={onChange} onInputChange={onInputChange} />);
  open();
  fireEvent.press(screen.getByRole("option", { name: "Ben Cruz" }));
  expect(onChange).toHaveBeenCalledWith("ben");
  expect(onInputChange).toHaveBeenCalledWith("Ben Cruz");
  expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
  expect(screen.getByText("Ben Cruz")).toBeTruthy();
  open();
  expect(screen.getByRole("option", { name: "Ben Cruz" }).props.accessibilityState).toMatchObject({
    selected: true,
  });
});

test("a controlled value is shown and a new tray starts with an empty query", () => {
  render(<Owner value="ana" />);
  expect(screen.getByText("Ana Reyes")).toBeTruthy();
  open();
  expect(search().props.value).toBe("");
});

test("without allowsCustomValue there is no confirm button and return does nothing", () => {
  const onChange = jest.fn();
  render(<Owner onChange={onChange} />);
  open();
  fireEvent.changeText(search(), "Someone new");
  expect(screen.queryByRole("button", { name: "Use this text" })).toBeNull();
  fireEvent(search(), "submitEditing");
  expect(onChange).not.toHaveBeenCalled();
});

test("a custom value is confirmed with the button and reported as null plus the text", () => {
  const onChange = jest.fn();
  const onInputChange = jest.fn();
  render(<Owner custom onChange={onChange} onInputChange={onInputChange} />);
  open();
  const confirm = () => screen.getByRole("button", { name: "Use this text" });
  expect(confirm().props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.changeText(search(), "  Cara Diaz ");
  expect(confirm().props.accessibilityState).toMatchObject({ disabled: false });
  fireEvent.press(confirm());
  expect(onChange).toHaveBeenCalledWith(null);
  expect(onInputChange).toHaveBeenCalledTimes(1);
  expect(onInputChange).toHaveBeenCalledWith("Cara Diaz");
  expect(screen.getByText("Cara Diaz")).toBeTruthy();
});

test("the return key confirms a custom value and the tray reopens with it", () => {
  const onInputChange = jest.fn();
  render(<Owner custom onInputChange={onInputChange} />);
  open();
  fireEvent.changeText(search(), "Cara");
  fireEvent(search(), "submitEditing");
  expect(onInputChange).toHaveBeenCalledWith("Cara");
  expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
  open();
  expect(search().props.value).toBe("Cara");
});

test("a custom filter decides what stays", () => {
  render(<Owner defaultFilter={(text, query) => text.startsWith(query)} />);
  open();
  fireEvent.changeText(search(), "Ben");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.changeText(search(), "Cruz");
  expect(screen.queryByRole("option")).toBeNull();
});

test("disabled and read-only fields do not open", () => {
  const { rerender } = render(<Owner isDisabled />);
  open();
  expect(screen.queryByRole("option")).toBeNull();
  expect(field().props.accessibilityState).toMatchObject({ disabled: true });
  rerender(<Owner isReadOnly />);
  open();
  expect(screen.queryByRole("option")).toBeNull();
});

test("onOpenChange reports opening and closing", () => {
  const onOpenChange = jest.fn();
  render(<Owner onOpenChange={onOpenChange} />);
  open();
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  fireEvent.press(screen.getByRole("option", { name: "Ana Reyes" }));
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

test("the error shows while invalid; dark theme renders", () => {
  mockUnistyles({ theme: "dark" });
  render(<Owner isInvalid errorMessage="Choose an owner" />);
  expect(screen.getByRole("alert")).toHaveTextContent("Choose an owner");
  expect(field().props.accessibilityHint).toBe("Show members. Choose an owner");
});
