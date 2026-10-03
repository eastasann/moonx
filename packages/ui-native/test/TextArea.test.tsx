import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextArea } from "../src/components/TextArea";
import { styleOf } from "./fieldHelpers";

const grow = (height: number) =>
  fireEvent(screen.getByLabelText("Why"), "contentSizeChange", {
    nativeEvent: { contentSize: { width: 200, height } },
  });

test.each(COMPONENT_SIZES)("renders a multiline input at size %s", (size) => {
  render(<TextArea label="Why" size={size} />);
  const input = screen.getByLabelText("Why");
  expect(input.props.multiline).toBe(true);
  expect(styleOf(input, "minHeight").minHeight).toBeGreaterThanOrEqual(
    themes.light.scale.component.field["text-area-min-height"],
  );
});

test("grows with the content height and never scrolls inside", () => {
  render(<TextArea label="Why" />);
  expect(screen.getByLabelText("Why").props.scrollEnabled).toBe(false);
  grow(180);
  expect(styleOf(screen.getByLabelText("Why"), "height").height).toBe(180);
  grow(240);
  expect(styleOf(screen.getByLabelText("Why"), "height").height).toBe(240);
  grow(60);
  expect(styleOf(screen.getByLabelText("Why"), "height").height).toBe(60);
});

test("the return key is not a submit: it is a line break", () => {
  render(<TextArea label="Why" />);
  expect(screen.getByLabelText("Why").props.submitBehavior).toBeUndefined();
  expect(screen.getByLabelText("Why").props.returnKeyType).toBeUndefined();
});

test("controlled and uncontrolled text", () => {
  const onChange = jest.fn();
  const { rerender } = render(<TextArea label="Why" defaultValue="a" onChange={onChange} />);
  fireEvent.changeText(screen.getByLabelText("Why"), "ab");
  expect(screen.getByLabelText("Why").props.value).toBe("ab");
  expect(onChange).toHaveBeenCalledWith("ab");
  rerender(<TextArea label="Why" value="fixed" onChange={onChange} />);
  fireEvent.changeText(screen.getByLabelText("Why"), "abc");
  expect(screen.getByLabelText("Why").props.value).toBe("fixed");
});

test("description, error and disabled", () => {
  render(<TextArea label="Why" description="Short" errorMessage="Too long" isInvalid isDisabled />);
  expect(screen.getByText("Short")).toBeTruthy();
  expect(screen.getByRole("alert")).toHaveTextContent("Too long");
  expect(screen.getByLabelText("Why").props.editable).toBe(false);
});
