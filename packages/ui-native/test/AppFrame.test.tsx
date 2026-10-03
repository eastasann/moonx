import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { Home } from "lucide-react-native";
import { StyleSheet, Text } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { ActionButton } from "../src/components/ActionButton";
import { AppFrame } from "../src/components/AppFrame";
import { Panel } from "../src/components/Panel";
import { TabBar } from "../src/components/TabBar";

afterEach(resetMockUnistyles);

const tabBar = (
  <TabBar
    aria-label="Main"
    items={[{ id: "dash", label: "Dashboard", icon: Home, isCurrent: true, onPress: () => {} }]}
  />
);

/** The nearest ancestor view whose flattened style sets `key`. */
function ancestorStyle(from: { parent: unknown } | null | undefined, key: string) {
  let node = from as { parent: unknown; props: { style?: unknown } } | null | undefined;
  while (node) {
    const style = StyleSheet.flatten(node.props?.style as never) as
      | Record<string, unknown>
      | undefined;
    if (style && style[key] !== undefined) return style;
    node = node.parent as typeof node;
  }
  return undefined;
}

const root = () => screen.toJSON() as unknown as { props: Record<string, unknown> };

test("header, body and tab bar render, the title as a level 1 heading", () => {
  render(
    <AppFrame
      tabBar={tabBar}
      title="Costs"
      backLink={<ActionButton aria-label="Back" icon={<Home />} />}
      status={<Text>Saved</Text>}
      actions={<ActionButton aria-label="Comments" icon={<Home />} />}
    >
      <Text>Body text</Text>
    </AppFrame>,
  );
  const heading = screen.getByRole("heading", { name: "Costs" });
  expect(heading.props["aria-level"]).toBe(1);
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Comments" })).toBeTruthy();
  expect(screen.getByText("Saved")).toBeTruthy();
  expect(screen.getByText("Body text")).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Dashboard" })).toBeTruthy();
});

test("the order is header, body, then the tab bar in the flow", () => {
  render(
    <AppFrame tabBar={tabBar} title="Costs">
      <Text>Body text</Text>
    </AppFrame>,
  );
  const json = JSON.stringify(screen.toJSON());
  expect(json.indexOf("Costs")).toBeLessThan(json.indexOf("Body text"));
  expect(json.indexOf("Body text")).toBeLessThan(json.indexOf("Dashboard"));
  expect(JSON.stringify(screen.toJSON())).not.toContain('"position":"absolute"');
});

test("the body is the main region and fills the space between header and tab bar", () => {
  render(
    <AppFrame tabBar={tabBar}>
      <Text>Body text</Text>
    </AppFrame>,
  );
  expect(screen.UNSAFE_getByProps({ role: "main" }).props.style.flex).toBe(1);
  expect(root().props.style).toMatchObject({ flex: 1 });
});

test("the header keeps the minimum height and the mobile gutter", () => {
  render(
    <AppFrame tabBar={tabBar} title="Costs">
      <Text>Body</Text>
    </AppFrame>,
  );
  const header = ancestorStyle(screen.getByRole("heading", { name: "Costs" }), "minHeight");
  expect(header).toMatchObject({
    minHeight: themes.light.layout["header-height"],
    paddingHorizontal: themes.light.layout["page-gutter-mobile"],
  });
});

test("the banner and header sit below the top safe-area inset", () => {
  render(
    <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: 34, left: 0, right: 0 }}>
      <AppFrame tabBar={tabBar} banner={<Text>Offline</Text>} title="Costs">
        <Text>Body</Text>
      </AppFrame>
    </SafeAreaInsetsContext.Provider>,
  );
  expect(ancestorStyle(screen.getByText("Offline"), "paddingTop")?.paddingTop).toBe(47);
  const json = JSON.stringify(screen.toJSON());
  expect(json.indexOf("Offline")).toBeLessThan(json.indexOf("Costs"));
});

test("the panel slot opens its tray and closed it adds nothing", () => {
  const panel = (isOpen: boolean) => (
    <Panel isOpen={isOpen} onOpenChange={() => {}} title="History" closeLabel="Close history">
      <Text>Change one</Text>
    </Panel>
  );
  const { rerender } = render(
    <AppFrame tabBar={tabBar} panel={panel(false)}>
      <Text>Body</Text>
    </AppFrame>,
  );
  expect(screen.queryByText("Change one")).toBeNull();
  rerender(
    <AppFrame tabBar={tabBar} panel={panel(true)}>
      <Text>Body</Text>
    </AppFrame>,
  );
  expect(screen.getByText("Change one")).toBeTruthy();
});

test("dark theme paints the canvas with the dark surface", () => {
  mockUnistyles({ theme: "dark" });
  render(
    <AppFrame tabBar={tabBar}>
      <Text>Body</Text>
    </AppFrame>,
  );
  expect(root().props.style).toMatchObject({ backgroundColor: themes.dark.color.surface.canvas });
});
