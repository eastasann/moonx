import { themes } from "@moonx/ui-tokens/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Card } from "../src/components/Card";
import { CardView } from "../src/components/CardView";

afterEach(resetMockUnistyles);

test("a card with onAction is a named button at least as tall as the touch target", () => {
  const onAction = jest.fn();
  render(
    <Card id="a" textValue="Alpha" onAction={onAction}>
      <Text>Alpha details</Text>
    </Card>,
  );
  const card = screen.getByRole("button", { name: "Alpha" });
  expect(card.props.style.minHeight).toBeGreaterThanOrEqual(44);
  fireEvent.press(card);
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Alpha details")).toBeTruthy();
});

test("disabled blocks the press and uses the disabled text color", () => {
  const onAction = jest.fn();
  render(
    <Card id="a" textValue="Alpha" isDisabled onAction={onAction}>
      Alpha
    </Card>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Alpha" }));
  expect(onAction).not.toHaveBeenCalled();
  expect(screen.getByText("Alpha").props.style.color).toBe(themes.light.color.text.disabled);
});

test("a card without any action is not pressable but keeps the touch height", () => {
  render(
    <Card id="a" textValue="Alpha">
      Alpha
    </Card>,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(
    (screen.toJSON() as unknown as { props: { role: string; style: { minHeight: number } } }).props,
  ).toMatchObject({
    role: "listitem",
  });
});

test("the CardView's selection colors a selected card and the dark theme swaps them", () => {
  render(
    <CardView aria-label="Competitors" selectionMode="single" defaultSelectedKeys={["a"]}>
      <Card id="a" textValue="Alpha">
        Alpha
      </Card>
      <Card id="b" textValue="Beta">
        Beta
      </Card>
    </CardView>,
  );
  const style = (name: string) => screen.getByRole("button", { name }).props.style;
  expect(style("Alpha").backgroundColor).toBe(themes.light.color.surface.selected);
  expect(style("Alpha").borderColor).toBe(themes.light.color.control["track-fill"]);
  expect(style("Beta").backgroundColor).toBe(themes.light.color.surface.raised);
  mockUnistyles({ theme: "dark" });
  screen.rerender(
    <CardView aria-label="Competitors" selectionMode="single" defaultSelectedKeys={["a"]}>
      <Card id="a" textValue="Alpha">
        Alpha
      </Card>
      <Card id="b" textValue="Beta">
        Beta
      </Card>
    </CardView>,
  );
  expect(style("Alpha").backgroundColor).toBe(themes.dark.color.surface.selected);
});
