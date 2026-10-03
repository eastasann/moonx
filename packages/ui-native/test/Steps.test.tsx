import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Steps } from "../src/components/Steps";

afterEach(resetMockUnistyles);

const items = [
  { id: "one", label: "Profile" },
  { id: "two", label: "Idea" },
  { id: "three", label: "Plan" },
];

const statusOf = (label: string) => screen.getByRole("listitem", { name: label }).props.testID;
// The markers are hidden from assistive technology, so queries must opt in to see them.
const hidden = { includeHiddenElements: true };
const marker = (n: string) => screen.getByText(n, hidden);

test("is a named list with one item per step", () => {
  render(<Steps aria-label="Progress" items={items} current="two" />);
  // The list is a plain container so each step stays one reachable item.
  expect(screen.UNSAFE_getByProps({ role: "list" }).props["aria-label"]).toBe("Progress");
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
});

test("steps before the current one are done, after it upcoming", () => {
  render(<Steps aria-label="Progress" items={items} current="two" />);
  expect(statusOf("Profile")).toBe("step-done");
  expect(statusOf("Idea")).toBe("step-current");
  expect(statusOf("Plan")).toBe("step-upcoming");
});

test("only the current step is selected for assistive technology", () => {
  render(<Steps aria-label="Progress" items={items} current="two" />);
  const selected = screen.getAllByRole("listitem").map((i) => i.props.accessibilityState.selected);
  expect(selected).toEqual([false, true, false]);
});

test("state is carried by shape: done shows a check, the others show their number", () => {
  render(<Steps aria-label="Progress" items={items} current="three" />);
  expect(screen.queryByText("1", hidden)).toBeNull();
  expect(screen.queryByText("2", hidden)).toBeNull();
  expect(marker("3")).toBeTruthy();
  const done = screen.getAllByTestId("step-done");
  expect(done).toHaveLength(2);
});

test("the status colors come from the theme, and follow the dark theme", () => {
  const { unmount } = render(<Steps aria-label="Progress" items={items} current="two" />);
  expect(marker("2").props.style.color).toBe(themes.light.color.control["on-primary"]);
  expect(marker("3").props.style.color).toBe(themes.light.color.text.secondary);
  unmount();
  mockUnistyles({ theme: "dark" });
  render(<Steps aria-label="Progress" items={items} current="two" />);
  expect(marker("2").props.style.color).toBe(themes.dark.color.control["on-primary"]);
});

test("an unknown current id leaves every step upcoming", () => {
  render(<Steps aria-label="Progress" items={items} current="missing" />);
  expect(screen.getAllByTestId("step-upcoming")).toHaveLength(3);
});
