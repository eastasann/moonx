import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { NumberField } from "../src/components/NumberField";
import { styleOf } from "./fieldHelpers";

const input = (name = "Price") => screen.getByLabelText(name);
const type = (text: string, name = "Price") => fireEvent.changeText(input(name), text);
const blur = (name = "Price") => fireEvent(input(name), "blur");

test.each(COMPONENT_SIZES)(
  "renders at size %s with tabular figures and the touch height",
  (size) => {
    render(<NumberField label="Price" size={size} />);
    expect(styleOf(input(), "minHeight").minHeight).toBeGreaterThanOrEqual(44);
    expect(styleOf(input(), "fontVariant").fontVariant).toEqual(["tabular-nums"]);
  },
);

test("formats currency in en-PH on blur and reports the number", () => {
  const onChange = jest.fn();
  render(
    <NumberField
      label="Price"
      formatOptions={{ style: "currency", currency: "PHP" }}
      onChange={onChange}
    />,
  );
  type("30000.5");
  expect(input().props.value).toBe("30000.5");
  expect(onChange).not.toHaveBeenCalled();
  blur();
  expect(input().props.value).toBe("₱30,000.50");
  expect(onChange).toHaveBeenLastCalledWith(30000.5);
});

test("reports the text on every keystroke while onChange waits for the commit", () => {
  const onChange = jest.fn();
  const onInputChange = jest.fn();
  render(<NumberField label="Price" onChange={onChange} onInputChange={onInputChange} />);
  type("1");
  type("1,");
  type("1,2");
  expect(onInputChange.mock.calls.map(([text]) => text)).toEqual(["1", "1,", "1,2"]);
  expect(onChange).not.toHaveBeenCalled();
  blur();
  expect(onChange).toHaveBeenLastCalledWith(12);
});

test("the return key commits like blur", () => {
  const onChange = jest.fn();
  render(<NumberField label="Price" onChange={onChange} />);
  type("1500");
  fireEvent(input(), "submitEditing");
  expect(onChange).toHaveBeenLastCalledWith(1500);
  expect(input().props.value).toBe("1,500");
});

test("formats percent from a 0 to 1 value and parses it back", () => {
  const onChange = jest.fn();
  render(
    <NumberField
      label="Rate"
      value={0.125}
      onChange={onChange}
      formatOptions={{ style: "percent", maximumFractionDigits: 1 }}
    />,
  );
  expect(input("Rate").props.value).toBe("12.5%");
  type("7", "Rate");
  blur("Rate");
  expect(onChange).toHaveBeenLastCalledWith(0.07);
});

test("an untouched field is not re-reported on blur even if display rounds the value", () => {
  const onChange = jest.fn();
  render(
    <NumberField
      label="Price"
      value={1234.5678}
      onChange={onChange}
      formatOptions={{ style: "currency", currency: "PHP" }}
    />,
  );
  expect(input().props.value).toBe("₱1,234.57");
  blur();
  expect(onChange).not.toHaveBeenCalled();
});

test("clamps to min and max and snaps to step on commit", () => {
  const onChange = jest.fn();
  render(<NumberField label="Days" minValue={0} maxValue={10} step={0.5} onChange={onChange} />);
  type("99", "Days");
  blur("Days");
  expect(onChange).toHaveBeenLastCalledWith(10);
  type("-4", "Days");
  blur("Days");
  expect(onChange).toHaveBeenLastCalledWith(0);
  type("2.3", "Days");
  blur("Days");
  expect(onChange).toHaveBeenLastCalledWith(2.5);
  expect(input("Days").props.value).toBe("2.5");
});

test("an empty or non-numeric text commits NaN and clears the text", () => {
  const onChange = jest.fn();
  render(<NumberField label="Price" defaultValue={5} onChange={onChange} />);
  expect(input().props.value).toBe("5");
  type("");
  blur();
  expect(onChange).toHaveBeenLastCalledWith(Number.NaN);
  expect(input().props.value).toBe("");
  type("abc");
  blur();
  expect(input().props.value).toBe("");
});

test("a value changed from outside replaces the text", () => {
  const { rerender } = render(<NumberField label="Price" value={1000} />);
  expect(input().props.value).toBe("1,000");
  rerender(<NumberField label="Price" value={2500.5} />);
  expect(input().props.value).toBe("2,500.5");
  rerender(<NumberField label="Price" value={Number.NaN} />);
  expect(input().props.value).toBe("");
});

test("keyboard: decimal pad, number pad for whole numbers, a minus-capable pad when negatives are allowed on iOS", () => {
  const original = Platform.OS;
  try {
    Platform.OS = "ios";
    const { rerender } = render(<NumberField label="Price" minValue={0} />);
    expect(input().props.keyboardType).toBe("decimal-pad");
    rerender(
      <NumberField label="Price" minValue={0} formatOptions={{ maximumFractionDigits: 0 }} />,
    );
    expect(input().props.keyboardType).toBe("number-pad");
    rerender(<NumberField label="Price" />);
    expect(input().props.keyboardType).toBe("numbers-and-punctuation");
    Platform.OS = "android";
    rerender(<NumberField label="Price" />);
    expect(input().props.keyboardType).toBe("decimal-pad");
  } finally {
    Platform.OS = original;
  }
});

test("disabled and read-only block editing; hidden label names the input; error shows when invalid", () => {
  const { rerender } = render(<NumberField label="Price" isDisabled />);
  expect(input().props.editable).toBe(false);
  rerender(<NumberField label="Price" isReadOnly />);
  expect(input().props.editable).toBe(false);
  rerender(<NumberField label="Price" isLabelHidden isInvalid errorMessage="Must be positive" />);
  expect(screen.queryByText("Price")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Must be positive");
});
