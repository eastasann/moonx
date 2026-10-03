import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ActionMenu } from "../src/components/ActionMenu";
import { MenuItem } from "../src/components/Menu";

const sample = (props: Partial<React.ComponentProps<typeof ActionMenu>> = {}) => (
  <ActionMenu label="More actions" {...props}>
    <MenuItem id="duplicate">Duplicate</MenuItem>
    <MenuItem id="delete" variant="negative">
      Delete
    </MenuItem>
  </ActionMenu>
);

test.each(COMPONENT_SIZES)("size %s is a square touch target named by label", (size) => {
  render(sample({ size }));
  const style = screen.getByRole("button", { name: "More actions" }).props.style;
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
  expect(style.minWidth).toBeGreaterThanOrEqual(44);
});

test("the button opens a tray named by the label and an item closes it with onAction", () => {
  const onAction = jest.fn();
  render(sample({ onAction }));
  fireEvent.press(screen.getByRole("button", { name: "More actions" }));
  expect(screen.getAllByLabelText("More actions")).toHaveLength(2);
  fireEvent.press(screen.getByRole("menuitem", { name: "Delete" }));
  expect(onAction).toHaveBeenCalledWith("delete");
  expect(screen.queryByRole("menuitem")).toBeNull();
});

test("disabled blocks opening", () => {
  render(sample({ isDisabled: true }));
  const button = screen.getByRole("button", { name: "More actions" });
  expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(button);
  expect(screen.queryByRole("menuitem")).toBeNull();
});
