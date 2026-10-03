import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Tree, TreeItem, type TreeProps } from "../src/components/Tree";

afterEach(resetMockUnistyles);

/** The row view around a node's chevron and content, where the indent and the selection color sit. */
function rowStyle(name: string) {
  let node = screen.getByRole("treeitem", { name }).parent;
  while (node && !(node.props.style as { paddingLeft?: number } | undefined)?.paddingLeft) {
    node = node.parent;
  }
  return node?.props.style as { paddingLeft: number; backgroundColor?: string };
}

function Outline(props: Partial<TreeProps<object>>) {
  return (
    <Tree aria-label="Outline" {...props}>
      <TreeItem id="s1" textValue="Section 1" title="Section 1" trailing="3">
        <TreeItem id="q1" textValue="Question 1" title="Question 1" />
        <TreeItem id="s1a" textValue="Section 1a" title="Section 1a">
          <TreeItem id="q2" textValue="Question 2" title="Question 2" />
        </TreeItem>
      </TreeItem>
      <TreeItem id="s2" textValue="Section 2" title="Section 2" isDisabled>
        {false}
      </TreeItem>
    </Tree>
  );
}

test("a named tree whose collapsed nodes hide their children", () => {
  render(<Outline />);
  expect(screen.getByLabelText("Outline").props.role).toBe("tree");
  expect(screen.getByRole("treeitem", { name: "Section 1" })).toBeTruthy();
  expect(screen.queryByText("Question 1")).toBeNull();
  expect(screen.getByText("3")).toBeTruthy();
});

test("a node with children reports aria-expanded and a leaf does not", () => {
  render(<Outline defaultExpandedKeys={["s1"]} />);
  expect(
    screen.getByRole("treeitem", { name: "Section 1" }).props.accessibilityState.expanded,
  ).toBe(true);
  expect(
    screen.getByRole("treeitem", { name: "Section 1a" }).props.accessibilityState.expanded,
  ).toBe(false);
  expect(
    screen.getByRole("treeitem", { name: "Question 1" }).props["aria-expanded"],
  ).toBeUndefined();
  expect(
    screen.getByRole("treeitem", { name: "Section 2" }).props["aria-expanded"],
  ).toBeUndefined();
});

test("pressing a node without action or selection expands and collapses it", () => {
  const onExpandedChange = jest.fn();
  render(<Outline onExpandedChange={onExpandedChange} />);
  fireEvent.press(screen.getByRole("treeitem", { name: "Section 1" }));
  expect(screen.getByText("Question 1")).toBeTruthy();
  expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(["s1"]));
  fireEvent.press(screen.getByRole("treeitem", { name: "Section 1a" }));
  expect(screen.getByText("Question 2")).toBeTruthy();
  fireEvent.press(screen.getByRole("treeitem", { name: "Section 1" }));
  expect(screen.queryByText("Question 1")).toBeNull();
  expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(["s1a"]));
});

test("expandedKeys controls expansion", () => {
  const { rerender } = render(<Outline expandedKeys={[]} />);
  fireEvent.press(screen.getByRole("treeitem", { name: "Section 1" }));
  expect(screen.queryByText("Question 1")).toBeNull();
  rerender(<Outline expandedKeys={["s1"]} />);
  expect(screen.getByText("Question 1")).toBeTruthy();
});

test("deeper nodes are indented by level", () => {
  render(<Outline defaultExpandedKeys={["s1", "s1a"]} />);
  const left = (name: string) => rowStyle(name).paddingLeft;
  expect(left("Section 1a")).toBeGreaterThan(left("Section 1"));
  expect(left("Question 2")).toBeGreaterThan(left("Section 1a"));
});

test("the row and the chevron are at least 44 high", () => {
  render(<Outline onAction={() => {}} />);
  expect(
    screen.getByRole("treeitem", { name: "Section 1" }).props.style.minHeight,
  ).toBeGreaterThanOrEqual(44);
  const chevron = screen.getByRole("button", { name: "Section 1" });
  expect(chevron.props.style.height).toBeGreaterThanOrEqual(44);
  expect(chevron.props.style.width).toBeGreaterThanOrEqual(44);
});

test("with onAction a press fires it and the chevron still expands", () => {
  const onAction = jest.fn();
  render(<Outline onAction={onAction} />);
  fireEvent.press(screen.getByRole("treeitem", { name: "Section 1" }));
  expect(onAction).toHaveBeenCalledWith("s1");
  expect(screen.queryByText("Question 1")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Section 1" }));
  expect(screen.getByText("Question 1")).toBeTruthy();
  expect(onAction).toHaveBeenCalledTimes(1);
});

test("a disabled node blocks presses", () => {
  const onAction = jest.fn();
  render(<Outline onAction={onAction} />);
  fireEvent.press(screen.getByRole("treeitem", { name: "Section 2" }));
  expect(onAction).not.toHaveBeenCalled();
  expect(
    screen.getByRole("treeitem", { name: "Section 2" }).props.accessibilityState.disabled,
  ).toBe(true);
});

test("single selection selects a node, marks it and leaves expansion to the chevron", () => {
  const onSelectionChange = jest.fn();
  render(<Outline selectionMode="single" onSelectionChange={onSelectionChange} />);
  fireEvent.press(screen.getByRole("treeitem", { name: "Section 1" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["s1"]));
  expect(
    screen.getByRole("treeitem", { name: "Section 1" }).props.accessibilityState.selected,
  ).toBe(true);
  expect(screen.queryByText("Question 1")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Section 1" }));
  expect(screen.getByText("Question 1")).toBeTruthy();
});

test("multiple selection toggles nodes and 'all' skips disabled ones", () => {
  const onSelectionChange = jest.fn();
  render(
    <Outline
      selectionMode="multiple"
      defaultSelectedKeys="all"
      defaultExpandedKeys={["s1"]}
      onSelectionChange={onSelectionChange}
    />,
  );
  expect(
    screen.getByRole("treeitem", { name: "Section 2" }).props.accessibilityState.selected,
  ).toBe(false);
  fireEvent.press(screen.getByRole("treeitem", { name: "Question 1" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["s1", "s1a", "q2"]));
});

test("dynamic items render through the render function", () => {
  const items = [
    { id: "a", name: "Alpha", kids: [{ id: "a1", name: "Alpha child" }] },
    { id: "b", name: "Beta", kids: [] },
  ];
  render(
    <Tree aria-label="Dynamic" items={items} defaultExpandedKeys={["a"]}>
      {(item: (typeof items)[number]) => (
        <TreeItem id={item.id} textValue={item.name} title={item.name}>
          {item.kids.map((kid) => (
            <TreeItem key={kid.id} id={kid.id} textValue={kid.name} title={kid.name} />
          ))}
        </TreeItem>
      )}
    </Tree>,
  );
  expect(screen.getByText("Alpha child")).toBeTruthy();
  expect(screen.getByRole("treeitem", { name: "Beta" }).props["aria-expanded"]).toBeUndefined();
});

test("hasChildItems makes a node expandable before its children exist", () => {
  render(
    <Tree aria-label="Lazy">
      <TreeItem id="a" textValue="Lazy node" title="Lazy node" hasChildItems />
    </Tree>,
  );
  expect(
    screen.getByRole("treeitem", { name: "Lazy node" }).props.accessibilityState.expanded,
  ).toBe(false);
});

test("the empty state shows when there are no nodes", () => {
  render(
    <Tree aria-label="Empty" emptyState={<Text>No sections</Text>}>
      {[]}
    </Tree>,
  );
  expect(screen.getByText("No sections")).toBeTruthy();
});

test("dark theme colors the selected node", () => {
  mockUnistyles({ theme: "dark" });
  render(<Outline selectionMode="single" defaultSelectedKeys={new Set(["s1"])} />);
  expect(rowStyle("Section 1").backgroundColor).toBe(themes.dark.color.surface.selected);
});
