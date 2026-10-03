import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Button } from "../src/components/Button";
import { Menu, MenuItem, MenuSection, MenuSeparator } from "../src/components/Menu";

afterEach(resetMockUnistyles);

const rolesOf = (role: string) =>
  screen.UNSAFE_root.findAll((node) => node.props.role === role && typeof node.type === "string");

function Sample(props: { onAction?: (key: React.Key) => void; onItem?: () => void }) {
  return (
    <Menu trigger={<Button>Actions</Button>} onAction={props.onAction}>
      <MenuItem id="duplicate" onAction={props.onItem}>
        Duplicate
      </MenuItem>
      <MenuItem id="archive" isDisabled>
        Archive
      </MenuItem>
      <MenuSeparator />
      <MenuSection title="Danger">
        <MenuItem id="delete" variant="negative">
          Delete
        </MenuItem>
      </MenuSection>
    </Menu>
  );
}

const open = () => fireEvent.press(screen.getByRole("button", { name: "Actions" }));

test("opens a tray named after the trigger with items, a section and a separator", () => {
  render(<Sample />);
  expect(screen.queryByRole("menuitem")).toBeNull();
  open();
  expect(rolesOf("menu")[0]?.props["aria-label"]).toBeUndefined();
  expect(screen.getByLabelText("Actions", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  expect(rolesOf("group")[0]?.props["aria-label"]).toBe("Danger");
  expect(rolesOf("separator")).toHaveLength(1);
});

test("every item is at least the touch target high", () => {
  render(<Sample />);
  open();
  for (const item of screen.getAllByRole("menuitem")) {
    expect(item.props.style.minHeight).toBeGreaterThanOrEqual(44);
  }
});

test("pressing an item runs both actions and closes the tray", () => {
  const onAction = jest.fn();
  const onItem = jest.fn();
  render(<Sample onAction={onAction} onItem={onItem} />);
  open();
  fireEvent.press(screen.getByRole("menuitem", { name: "Duplicate" }));
  expect(onItem).toHaveBeenCalledTimes(1);
  expect(onAction).toHaveBeenCalledWith("duplicate");
  expect(screen.queryByRole("menuitem")).toBeNull();
});

test("a disabled item is reported and blocks the action", () => {
  const onAction = jest.fn();
  render(<Sample onAction={onAction} />);
  open();
  const archive = screen.getByRole("menuitem", { name: "Archive" });
  expect(archive.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(archive);
  expect(onAction).not.toHaveBeenCalled();
});

test("disabledKeys disables items by id", () => {
  const onAction = jest.fn();
  render(
    <Menu trigger={<Button>Actions</Button>} onAction={onAction} disabledKeys={["a"]}>
      <MenuItem id="a">A</MenuItem>
    </Menu>,
  );
  open();
  fireEvent.press(screen.getByRole("menuitem", { name: "A" }));
  expect(onAction).not.toHaveBeenCalled();
});

test("the negative item has a different color than the default one", () => {
  render(<Sample />);
  open();
  const color = (name: string) => {
    const style = screen.getByText(name).props.style;
    return (Array.isArray(style) ? Object.assign({}, ...style) : style).color;
  };
  expect(color("Delete")).not.toBe(color("Duplicate"));
});

test("single selection checks one item, reports a Set and closes", () => {
  const onSelectionChange = jest.fn();
  render(
    <Menu
      trigger={<Button>Actions</Button>}
      selectionMode="single"
      defaultSelectedKeys={["a"]}
      onSelectionChange={onSelectionChange}
    >
      <MenuItem id="a">A</MenuItem>
      <MenuItem id="b">B</MenuItem>
    </Menu>,
  );
  open();
  expect(screen.getByRole("radio", { name: "A" }).props.accessibilityState).toMatchObject({
    checked: true,
  });
  fireEvent.press(screen.getByRole("radio", { name: "B" }));
  expect(onSelectionChange).toHaveBeenCalledWith(new Set(["b"]));
  expect(screen.queryByRole("radio")).toBeNull();
  open();
  expect(screen.getByRole("radio", { name: "B" }).props.accessibilityState).toMatchObject({
    checked: true,
  });
});

test("multiple selection toggles items and keeps the tray open", () => {
  const onSelectionChange = jest.fn();
  render(
    <Menu
      trigger={<Button>Actions</Button>}
      selectionMode="multiple"
      onSelectionChange={onSelectionChange}
    >
      <MenuItem id="a">A</MenuItem>
      <MenuItem id="b">B</MenuItem>
    </Menu>,
  );
  open();
  fireEvent.press(screen.getByRole("checkbox", { name: "A" }));
  fireEvent.press(screen.getByRole("checkbox", { name: "B" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["a", "b"]));
  fireEvent.press(screen.getByRole("checkbox", { name: "A" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["b"]));
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
});

test("controlled selectedKeys decide what is checked", () => {
  render(
    <Menu trigger={<Button>Actions</Button>} selectionMode="single" selectedKeys={["b"]}>
      <MenuItem id="a">A</MenuItem>
      <MenuItem id="b">B</MenuItem>
    </Menu>,
  );
  open();
  fireEvent.press(screen.getByRole("radio", { name: "A" }));
  open();
  expect(screen.getByRole("radio", { name: "B" }).props.accessibilityState).toMatchObject({
    checked: true,
  });
});

test("items can come from items and a render function", () => {
  render(
    <Menu
      trigger={<Button>Actions</Button>}
      items={[
        { id: "x", name: "Ex" },
        { id: "y", name: "Why" },
      ]}
    >
      {(item: { id: string; name: string }) => <MenuItem id={item.id}>{item.name}</MenuItem>}
    </Menu>,
  );
  open();
  expect(screen.getByRole("menuitem", { name: "Ex" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Why" })).toBeTruthy();
});

test("an aria-label on the trigger names the tray; isOpen controls it", () => {
  const { rerender } = render(
    <Menu trigger={<Button aria-label="Row actions">⋯</Button>} isOpen={false}>
      <MenuItem id="a">A</MenuItem>
    </Menu>,
  );
  rerender(
    <Menu trigger={<Button aria-label="Row actions">⋯</Button>} isOpen>
      <MenuItem id="a">A</MenuItem>
    </Menu>,
  );
  act(() => {});
  expect(screen.getAllByLabelText("Row actions")).toHaveLength(2);
  expect(screen.getByRole("menuitem", { name: "A" })).toBeTruthy();
});

test("the negative item color follows the dark theme", () => {
  render(<Sample />);
  open();
  const color = () => {
    const style = screen.getByText("Delete").props.style;
    return (Array.isArray(style) ? Object.assign({}, ...style) : style).color;
  };
  const light = color();
  act(() => mockUnistyles({ theme: "dark" }));
  expect(color()).not.toBe(light);
});
