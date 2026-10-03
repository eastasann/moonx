import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { ActionGroup, ActionGroupItem } from "../src/components/ActionGroup";

/** Containers are not accessible elements (that would hide their children), so find them by role prop. */
const hostsWithRole = (role: string) =>
  screen.UNSAFE_root.findAll((node) => node.props.role === role && typeof node.type === "string");

const icon = <View />;

test("none mode renders a named toolbar of buttons that call onPress", () => {
  const onPress = jest.fn();
  render(
    <ActionGroup aria-label="Tools">
      <ActionGroupItem id="comments" icon={icon} aria-label="Comments" onPress={onPress} />
      <ActionGroupItem id="history">History</ActionGroupItem>
    </ActionGroup>,
  );
  expect(hostsWithRole("toolbar")[0]?.props["aria-label"]).toBe("Tools");
  fireEvent.press(screen.getByRole("button", { name: "Comments" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "History" }).props.style.minHeight,
  ).toBeGreaterThanOrEqual(44);
});

test("single mode is a radio group and replaces the selection; pressing it again clears it", () => {
  const onChange = jest.fn();
  render(
    <ActionGroup aria-label="View" selectionMode="single" defaultValue={["a"]} onChange={onChange}>
      <ActionGroupItem id="a">A</ActionGroupItem>
      <ActionGroupItem id="b">B</ActionGroupItem>
    </ActionGroup>,
  );
  expect(hostsWithRole("radiogroup")[0]?.props["aria-label"]).toBe("View");
  expect(screen.getByRole("radio", { name: "A" }).props.accessibilityState).toMatchObject({
    checked: true,
  });
  fireEvent.press(screen.getByRole("radio", { name: "B" }));
  expect(onChange).toHaveBeenLastCalledWith(["b"]);
  expect(screen.getByRole("radio", { name: "A" }).props.accessibilityState).toMatchObject({
    checked: false,
  });
  fireEvent.press(screen.getByRole("radio", { name: "B" }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

test("multiple mode toggles items independently", () => {
  const onChange = jest.fn();
  render(
    <ActionGroup aria-label="Filters" selectionMode="multiple" onChange={onChange}>
      <ActionGroupItem id="a">A</ActionGroupItem>
      <ActionGroupItem id="b">B</ActionGroupItem>
    </ActionGroup>,
  );
  fireEvent.press(screen.getByRole("checkbox", { name: "A" }));
  fireEvent.press(screen.getByRole("checkbox", { name: "B" }));
  expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
  fireEvent.press(screen.getByRole("checkbox", { name: "A" }));
  expect(onChange).toHaveBeenLastCalledWith(["b"]);
});

test("a controlled value is not changed by presses", () => {
  render(
    <ActionGroup aria-label="Filters" selectionMode="multiple" value={["a"]}>
      <ActionGroupItem id="a">A</ActionGroupItem>
      <ActionGroupItem id="b">B</ActionGroupItem>
    </ActionGroup>,
  );
  fireEvent.press(screen.getByRole("checkbox", { name: "B" }));
  expect(screen.getByRole("checkbox", { name: "B" }).props.accessibilityState).toMatchObject({
    checked: false,
  });
});

test("group isDisabled and item isDisabled block presses in every mode", () => {
  const onPress = jest.fn();
  const onChange = jest.fn();
  const { rerender } = render(
    <ActionGroup aria-label="Tools" isDisabled>
      <ActionGroupItem id="a" onPress={onPress}>
        A
      </ActionGroupItem>
    </ActionGroup>,
  );
  fireEvent.press(screen.getByRole("button", { name: "A" }));
  expect(onPress).not.toHaveBeenCalled();
  rerender(
    <ActionGroup aria-label="Tools" selectionMode="single" onChange={onChange}>
      <ActionGroupItem id="a" isDisabled>
        A
      </ActionGroupItem>
    </ActionGroup>,
  );
  fireEvent.press(screen.getByRole("radio", { name: "A" }));
  expect(onChange).not.toHaveBeenCalled();
});

test("selected items get the selected look and the vertical group stacks", () => {
  render(
    <ActionGroup
      aria-label="Tools"
      selectionMode="single"
      defaultValue={["a"]}
      orientation="vertical"
    >
      <ActionGroupItem id="a">A</ActionGroupItem>
      <ActionGroupItem id="b">B</ActionGroupItem>
    </ActionGroup>,
  );
  const a = screen.getByRole("radio", { name: "A" }).props.style.backgroundColor;
  const b = screen.getByRole("radio", { name: "B" }).props.style.backgroundColor;
  expect(a).not.toBe(b);
  expect(hostsWithRole("radiogroup")[0]?.props.style.flexDirection).toBe("column");
});
