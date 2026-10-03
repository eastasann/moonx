import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Home, Lightbulb, Menu } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Badge } from "../src/components/Badge";
import { TabBar, type TabBarItem } from "../src/components/TabBar";

afterEach(resetMockUnistyles);

const noop = () => {};
const items = (over: Partial<Record<string, Partial<TabBarItem>>> = {}): TabBarItem[] => [
  { id: "dash", label: "Dashboard", icon: Home, isCurrent: true, onPress: noop, ...over.dash },
  {
    id: "ideas",
    label: "Ideas",
    icon: Lightbulb,
    badge: <Badge>3</Badge>,
    onPress: noop,
    ...over.ideas,
  },
  { id: "more", label: "More", icon: Menu, isExpanded: false, onPress: noop, ...over.more },
];

const root = () => screen.toJSON() as unknown as { props: Record<string, unknown> };

test("a named tab list with one tab per item", () => {
  render(<TabBar aria-label="Main" items={items()} />);
  expect(root().props.role).toBe("tablist");
  expect(root().props["aria-label"]).toBe("Main");
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
});

test("the current tab is selected and the others are not", () => {
  render(<TabBar aria-label="Main" items={items()} />);
  expect(screen.getByRole("tab", { name: "Dashboard" }).props.accessibilityState.selected).toBe(
    true,
  );
  expect(screen.getByRole("tab", { name: "Ideas" }).props.accessibilityState.selected).toBe(false);
});

test("the current tab is not marked by color alone: its top border differs", () => {
  render(<TabBar aria-label="Main" items={items()} />);
  const current = screen.getByRole("tab", { name: "Dashboard" }).props.style;
  const other = screen.getByRole("tab", { name: "Ideas" }).props.style;
  expect(current.borderTopColor).toBe(themes.light.color.control["track-fill"]);
  expect(other.borderTopColor).toBe("transparent");
});

test("every tab is at least 44 by 44 and as tall as the tab bar", () => {
  render(<TabBar aria-label="Main" items={items()} />);
  for (const name of ["Dashboard", "Ideas"]) {
    const style = screen.getByRole("tab", { name }).props.style;
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(themes.light.layout["tab-bar-height"]);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  }
});

test("pressing a tab calls its onPress", () => {
  const onPress = jest.fn();
  render(<TabBar aria-label="Main" items={items({ ideas: { onPress } })} />);
  fireEvent.press(screen.getByRole("tab", { name: "Ideas" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("the badge is read as the tab's value, after its label", () => {
  render(<TabBar aria-label="Main" items={items()} />);
  const tab = screen.getByRole("tab", { name: "Ideas" });
  expect(tab.props.accessibilityValue).toEqual({ text: "3" });
  expect(screen.getByText("3", { includeHiddenElements: true })).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "Dashboard" }).props.accessibilityValue.text,
  ).toBeUndefined();
});

test("a tab that opens a tray is a button that reports aria-expanded", () => {
  const { rerender } = render(<TabBar aria-label="Main" items={items()} />);
  expect(screen.getByRole("button", { name: "More" }).props.accessibilityState.expanded).toBe(
    false,
  );
  rerender(<TabBar aria-label="Main" items={items({ more: { isExpanded: true } })} />);
  expect(screen.getByRole("button", { name: "More" }).props.accessibilityState.expanded).toBe(true);
});

test("the bar is in the layout flow and adds the bottom safe-area inset", () => {
  render(
    <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: 34, left: 0, right: 0 }}>
      <TabBar aria-label="Main" items={items()} />
    </SafeAreaInsetsContext.Provider>,
  );
  const style = StyleSheet.flatten(root().props.style as never) as Record<string, unknown>;
  expect(style.paddingBottom).toBe(34);
  expect(style.position).toBeUndefined();
  expect(style.flexDirection).toBe("row");
});

test("dark theme paints the bar with the dark surface", () => {
  mockUnistyles({ theme: "dark" });
  render(<TabBar aria-label="Main" items={items()} />);
  const style = StyleSheet.flatten(root().props.style as never) as Record<string, unknown>;
  expect(style.backgroundColor).toBe(themes.dark.color.surface.raised);
});
