import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, ScrollView, Text } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Tab, TabList, TabPanel, Tabs } from "../src/components/Tabs";

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  resetMockUnistyles();
  jest.restoreAllMocks();
});

function Example(props: Partial<React.ComponentProps<typeof Tabs>>) {
  return (
    <Tabs {...props}>
      <TabList aria-label="Sections">
        <Tab id="locked" isDisabled>
          Locked
        </Tab>
        <Tab id="assumptions">Assumptions</Tab>
        <Tab id="risks">Risks</Tab>
      </TabList>
      <TabPanel id="locked">
        <Text>Locked content</Text>
      </TabPanel>
      <TabPanel id="assumptions">
        <Text>Assumption list</Text>
      </TabPanel>
      <TabPanel id="risks">
        <Text>Risk list</Text>
      </TabPanel>
    </Tabs>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });
const selected = (name: string) => tab(name).props.accessibilityState.selected;

test.each(COMPONENT_SIZES)("size %s renders tabs at least as tall as the touch target", (size) => {
  render(<Example size={size} />);
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  for (const node of screen.getAllByRole("tab")) {
    expect(node.props.style.minHeight).toBeGreaterThanOrEqual(44);
  }
});

test("the list is a named tablist", () => {
  render(<Example />);
  const list = screen.UNSAFE_getByType(ScrollView);
  expect(list.props.role).toBe("tablist");
  expect(list.props["aria-label"]).toBe("Sections");
  expect(list.props.horizontal).toBe(true);
});

test("selects the first enabled tab and shows only its panel", () => {
  render(<Example />);
  expect(selected("Assumptions")).toBe(true);
  expect(selected("Risks")).toBe(false);
  expect(screen.getByText("Assumption list")).toBeTruthy();
  expect(screen.queryByText("Risk list")).toBeNull();
  expect(screen.queryByText("Locked content")).toBeNull();
});

test("pressing a tab selects it, reports it and swaps the panel", () => {
  const onSelectionChange = jest.fn();
  render(<Example onSelectionChange={onSelectionChange} />);
  fireEvent.press(tab("Risks"));
  expect(selected("Risks")).toBe(true);
  expect(selected("Assumptions")).toBe(false);
  expect(onSelectionChange).toHaveBeenCalledWith("risks");
  expect(screen.getByText("Risk list")).toBeTruthy();
  expect(screen.queryByText("Assumption list")).toBeNull();
});

test("pressing the selected tab does not report a change", () => {
  const onSelectionChange = jest.fn();
  render(<Example onSelectionChange={onSelectionChange} />);
  fireEvent.press(tab("Assumptions"));
  expect(onSelectionChange).not.toHaveBeenCalled();
});

test("a disabled tab is aria-disabled and ignores presses", () => {
  const onSelectionChange = jest.fn();
  render(<Example onSelectionChange={onSelectionChange} />);
  expect(tab("Locked").props.accessibilityState.disabled).toBe(true);
  fireEvent.press(tab("Locked"));
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(screen.queryByText("Locked content")).toBeNull();
});

test("disabledKeys and isDisabled block tabs too", () => {
  const { unmount } = render(<Example disabledKeys={["risks"]} />);
  expect(tab("Risks").props.accessibilityState.disabled).toBe(true);
  unmount();
  render(<Example isDisabled />);
  for (const node of screen.getAllByRole("tab")) {
    expect(node.props.accessibilityState.disabled).toBe(true);
  }
});

test("defaultSelectedKey starts elsewhere", () => {
  render(<Example defaultSelectedKey="risks" />);
  expect(selected("Risks")).toBe(true);
  expect(screen.getByText("Risk list")).toBeTruthy();
});

test("selectedKey controls the selection: a press reports but does not switch", () => {
  const onSelectionChange = jest.fn();
  const { rerender } = render(
    <Example selectedKey="assumptions" onSelectionChange={onSelectionChange} />,
  );
  fireEvent.press(tab("Risks"));
  expect(onSelectionChange).toHaveBeenCalledWith("risks");
  expect(screen.getByText("Assumption list")).toBeTruthy();
  rerender(<Example selectedKey="risks" onSelectionChange={onSelectionChange} />);
  expect(screen.getByText("Risk list")).toBeTruthy();
});

test("shouldForceMount keeps an unselected panel mounted but hidden", () => {
  render(
    <Tabs>
      <TabList aria-label="Sections">
        <Tab id="a">A</Tab>
        <Tab id="b">B</Tab>
      </TabList>
      <TabPanel id="a">
        <Text>Panel A</Text>
      </TabPanel>
      <TabPanel id="b" shouldForceMount testID="panel-b">
        <Text>Panel B</Text>
      </TabPanel>
    </Tabs>,
  );
  const panel = screen.getByTestId("panel-b", { includeHiddenElements: true });
  expect(panel.props["aria-hidden"]).toBe(true);
  expect(screen.getByText("Panel B", { includeHiddenElements: true })).toBeTruthy();
  fireEvent.press(tab("B"));
  expect(screen.getByTestId("panel-b").props["aria-hidden"]).toBe(false);
});

test("the selected tab is scrolled into view, centered when there is room", () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo" as never);
  render(<Example defaultSelectedKey="risks" />);
  const list = screen.UNSAFE_getByType(ScrollView);
  fireEvent(list, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 60 } } });
  fireEvent(tab("Risks"), "layout", {
    nativeEvent: { layout: { x: 400, y: 0, width: 100, height: 60 } },
  });
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 300, animated: true });
  fireEvent(tab("Assumptions"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 60 } },
  });
  fireEvent.press(tab("Assumptions"));
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
});

test("selected and unselected labels follow the theme, light and dark", () => {
  const { unmount } = render(<Example />);
  expect(screen.getByText("Assumptions").props.style.color).toBe(themes.light.color.text.primary);
  expect(screen.getByText("Risks").props.style.color).toBe(themes.light.color.text.secondary);
  expect(tab("Assumptions").props.style.borderBottomColor).toBe(
    themes.light.color.control["track-fill"],
  );
  unmount();
  mockUnistyles({ theme: "dark" });
  render(<Example />);
  expect(screen.getByText("Assumptions").props.style.color).toBe(themes.dark.color.text.primary);
});

test("using a part outside Tabs fails loudly", () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Tab id="x">X</Tab>)).toThrow("inside Tabs");
});
