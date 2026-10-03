import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SearchField } from "../src/components/SearchField";
import { styleOf } from "./fieldHelpers";

test.each(COMPONENT_SIZES)("renders a search input at size %s", (size) => {
  render(<SearchField label="Search" clearLabel="Clear" size={size} />);
  const input = screen.getByLabelText("Search");
  expect(input.props.role).toBe("searchbox");
  expect(input.props.returnKeyType).toBe("search");
  expect(styleOf(input, "minHeight").minHeight).toBeGreaterThanOrEqual(44);
});

test("the clear button shows only with text and empties the field", () => {
  const onChange = jest.fn();
  const onClear = jest.fn();
  render(<SearchField label="Search" clearLabel="Clear" onChange={onChange} onClear={onClear} />);
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  fireEvent.changeText(screen.getByLabelText("Search"), "cafe");
  const clear = screen.getByRole("button", { name: "Clear" });
  expect(styleOf(clear, "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  fireEvent.press(clear);
  expect(screen.getByLabelText("Search").props.value).toBe("");
  expect(onChange).toHaveBeenLastCalledWith("");
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
});

test("the search key submits the current text", () => {
  const onSubmit = jest.fn();
  render(<SearchField label="Search" clearLabel="Clear" defaultValue="cafe" onSubmit={onSubmit} />);
  fireEvent(screen.getByLabelText("Search"), "submitEditing");
  expect(onSubmit).toHaveBeenCalledWith("cafe");
});

test("controlled value; disabled blocks editing and the clear button", () => {
  const onClear = jest.fn();
  render(
    <SearchField label="Search" clearLabel="Clear" value="cafe" isDisabled onClear={onClear} />,
  );
  expect(screen.getByLabelText("Search").props.value).toBe("cafe");
  expect(screen.getByLabelText("Search").props.editable).toBe(false);
  fireEvent.press(screen.getByRole("button", { name: "Clear" }));
  expect(onClear).not.toHaveBeenCalled();
});

test("a hidden label still names the input; the error appears when invalid", () => {
  render(
    <SearchField
      label="Search"
      clearLabel="Clear"
      isLabelHidden
      isInvalid
      errorMessage="No access"
    />,
  );
  expect(screen.queryByText("Search")).toBeNull();
  expect(screen.getByLabelText("Search")).toBeTruthy();
  expect(screen.getByRole("alert")).toHaveTextContent("No access");
});
