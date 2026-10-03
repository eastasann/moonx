import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { TextField } from "../src/components/TextField";
import { styleOf } from "./fieldHelpers";

afterEach(resetMockUnistyles);

test.each(COMPONENT_SIZES)(
  "renders a labelled input at size %s, at least the touch target tall",
  (size) => {
    render(<TextField label="Name" size={size} />);
    const input = screen.getByLabelText("Name");
    expect(screen.getByText("Name")).toBeTruthy();
    expect(styleOf(input, "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  },
);

test("uncontrolled: typing updates the text and reports it", () => {
  const onChange = jest.fn();
  render(<TextField label="Name" defaultValue="Ann" onChange={onChange} />);
  const input = screen.getByLabelText("Name");
  expect(input.props.value).toBe("Ann");
  fireEvent.changeText(input, "Anna");
  expect(onChange).toHaveBeenCalledWith("Anna");
  expect(screen.getByLabelText("Name").props.value).toBe("Anna");
});

test("controlled: the text follows `value`, not the typing", () => {
  const onChange = jest.fn();
  const { rerender } = render(<TextField label="Name" value="Ann" onChange={onChange} />);
  fireEvent.changeText(screen.getByLabelText("Name"), "Anna");
  expect(onChange).toHaveBeenCalledWith("Anna");
  expect(screen.getByLabelText("Name").props.value).toBe("Ann");
  rerender(<TextField label="Name" value="Anna" onChange={onChange} />);
  expect(screen.getByLabelText("Name").props.value).toBe("Anna");
});

test("type picks the keyboard and hides a password", () => {
  const { rerender } = render(<TextField label="Pw" type="password" />);
  expect(screen.getByLabelText("Pw").props.secureTextEntry).toBe(true);
  expect(screen.getByLabelText("Pw").props.autoCapitalize).toBe("none");
  rerender(<TextField label="Pw" type="email" />);
  expect(screen.getByLabelText("Pw").props.inputMode).toBe("email");
  expect(screen.getByLabelText("Pw").props.secureTextEntry).toBe(false);
  rerender(<TextField label="Pw" type="email" inputMode="numeric" />);
  expect(screen.getByLabelText("Pw").props.inputMode).toBe("numeric");
});

test("disabled and read-only inputs cannot be edited", () => {
  const { rerender } = render(<TextField label="Name" isDisabled />);
  expect(screen.getByLabelText("Name").props.editable).toBe(false);
  rerender(<TextField label="Name" isReadOnly />);
  expect(screen.getByLabelText("Name").props.editable).toBe(false);
  rerender(<TextField label="Name" />);
  expect(screen.getByLabelText("Name").props.editable).toBe(true);
});

test("the error message shows only while invalid, as an alert, and joins the hint", () => {
  const { rerender } = render(
    <TextField label="Name" description="As on your ID" errorMessage="Required" />,
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("As on your ID")).toBeTruthy();
  expect(screen.getByLabelText("Name").props.accessibilityHint).toBe("As on your ID");
  rerender(
    <TextField label="Name" description="As on your ID" errorMessage="Required" isInvalid />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Required");
  expect(screen.getByLabelText("Name").props.accessibilityHint).toBe("As on your ID. Required");
});

test("a hidden label is not drawn but still names the input", () => {
  render(<TextField label="Name" isLabelHidden />);
  expect(screen.queryByText("Name")).toBeNull();
  expect(screen.getByLabelText("Name")).toBeTruthy();
});

test("aria-label overrides the name taken from the label", () => {
  render(<TextField label="Name" aria-label="Full name" />);
  expect(screen.getByLabelText("Full name")).toBeTruthy();
});

test("focus draws the focus ring and reports focus and blur", () => {
  const onFocus = jest.fn();
  const onBlur = jest.fn();
  render(<TextField label="Name" onFocus={onFocus} onBlur={onBlur} />);
  const ringWidth = () => styleOf(screen.getByLabelText("Name"), "outlineWidth").outlineWidth;
  expect(ringWidth()).toBe(0);
  fireEvent(screen.getByLabelText("Name"), "focus");
  expect(onFocus).toHaveBeenCalled();
  expect(ringWidth()).toBeGreaterThan(0);
  fireEvent(screen.getByLabelText("Name"), "blur");
  expect(onBlur).toHaveBeenCalled();
  expect(ringWidth()).toBe(0);
});

test("the return key calls onSubmit", () => {
  const onSubmit = jest.fn();
  render(<TextField label="Name" onSubmit={onSubmit} />);
  fireEvent(screen.getByLabelText("Name"), "submitEditing");
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("invalid colors the border negative, in light and dark", () => {
  const border = () => styleOf(screen.getByLabelText("Name"), "borderColor").borderColor;
  const { unmount } = render(<TextField label="Name" isInvalid />);
  expect(border()).toBe(themes.light.color.negative.fg);
  unmount();
  mockUnistyles({ theme: "dark" });
  render(<TextField label="Name" isInvalid />);
  expect(border()).toBe(themes.dark.color.negative.fg);
});

test("disabled uses the disabled surface, not the invalid border", () => {
  render(<TextField label="Name" isInvalid isDisabled />);
  const frame = styleOf(screen.getByLabelText("Name"), "borderColor");
  expect(frame.borderColor).toBe(themes.light.color.border.hairline);
  expect(frame.backgroundColor).toBe(themes.light.color.control.disabled);
});
