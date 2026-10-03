import { themes } from "@moonx/ui-tokens/native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Accordion, Disclosure } from "../src/components/Disclosure";

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  resetMockUnistyles();
  jest.restoreAllMocks();
});

// The heading wrapper is not an accessibility element itself (that would hide the toggle inside it).
const heading = () => screen.UNSAFE_getByProps({ role: "heading" });
const toggle = (name: string) => screen.getByRole("button", { name });

describe("Disclosure", () => {
  test("toggles on press, reports it, and mounts the panel only while open", () => {
    const onExpandedChange = jest.fn();
    render(
      <Disclosure title="Example" onExpandedChange={onExpandedChange}>
        Panel text
      </Disclosure>,
    );
    expect(toggle("Example").props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByText("Panel text")).toBeNull();
    fireEvent.press(toggle("Example"));
    expect(toggle("Example").props.accessibilityState.expanded).toBe(true);
    expect(screen.getByText("Panel text")).toBeTruthy();
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    fireEvent.press(toggle("Example"));
    expect(screen.queryByText("Panel text")).toBeNull();
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  });

  test("the toggle is at least a touch target tall and sits in a heading of the given level", () => {
    render(
      <Disclosure title="Example" headingLevel={4}>
        Panel text
      </Disclosure>,
    );
    expect(toggle("Example").props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(heading().props["aria-level"]).toBe(4);
  });

  test("defaults to level 3, and defaultExpanded opens it", () => {
    render(
      <Disclosure title="Example" defaultExpanded>
        Panel text
      </Disclosure>,
    );
    expect(heading().props["aria-level"]).toBe(3);
    expect(screen.getByText("Panel text")).toBeTruthy();
  });

  test("isExpanded controls it: a press reports but does not change it", () => {
    const onExpandedChange = jest.fn();
    const { rerender } = render(
      <Disclosure title="Example" isExpanded={false} onExpandedChange={onExpandedChange}>
        Panel text
      </Disclosure>,
    );
    fireEvent.press(toggle("Example"));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Panel text")).toBeNull();
    rerender(
      <Disclosure title="Example" isExpanded onExpandedChange={onExpandedChange}>
        Panel text
      </Disclosure>,
    );
    expect(screen.getByText("Panel text")).toBeTruthy();
  });

  test("isDisabled blocks presses, sets aria-disabled and dims the title", () => {
    const onExpandedChange = jest.fn();
    render(
      <Disclosure title="Example" isDisabled onExpandedChange={onExpandedChange}>
        Panel text
      </Disclosure>,
    );
    fireEvent.press(toggle("Example"));
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(toggle("Example").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Example").props.style.color).toBe(themes.light.color.text.disabled);
  });

  test("uses dark theme colors", () => {
    mockUnistyles({ theme: "dark" });
    render(<Disclosure title="Example">Panel text</Disclosure>);
    expect(screen.getByText("Example").props.style.color).toBe(themes.dark.color.text.primary);
  });

  test("reduced motion still toggles", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    render(<Disclosure title="Example">Panel text</Disclosure>);
    await act(async () => {});
    fireEvent.press(toggle("Example"));
    expect(screen.getByText("Panel text")).toBeTruthy();
  });
});

describe("Accordion", () => {
  function Sample(props: Partial<React.ComponentProps<typeof Accordion>>) {
    return (
      <Accordion {...props}>
        <Disclosure id="a" title="First">
          One
        </Disclosure>
        <Disclosure id="b" title="Second">
          Two
        </Disclosure>
      </Accordion>
    );
  }

  test("keeps one item open at a time by default", () => {
    render(<Sample />);
    fireEvent.press(toggle("First"));
    fireEvent.press(toggle("Second"));
    expect(toggle("First").props.accessibilityState.expanded).toBe(false);
    expect(toggle("Second").props.accessibilityState.expanded).toBe(true);
    expect(screen.queryByText("One")).toBeNull();
    expect(screen.getByText("Two")).toBeTruthy();
  });

  test("allowsMultipleExpanded keeps several open", () => {
    render(<Sample allowsMultipleExpanded />);
    fireEvent.press(toggle("First"));
    fireEvent.press(toggle("Second"));
    expect(toggle("First").props.accessibilityState.expanded).toBe(true);
    expect(toggle("Second").props.accessibilityState.expanded).toBe(true);
  });

  test("defaultExpandedKeys, and onExpandedChange gets the set of open keys", () => {
    const onExpandedChange = jest.fn();
    render(<Sample defaultExpandedKeys={["a"]} onExpandedChange={onExpandedChange} />);
    expect(toggle("First").props.accessibilityState.expanded).toBe(true);
    fireEvent.press(toggle("Second"));
    expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(["b"]));
  });

  test("expandedKeys controls it", () => {
    const onExpandedChange = jest.fn();
    render(<Sample expandedKeys={["b"]} onExpandedChange={onExpandedChange} />);
    fireEvent.press(toggle("First"));
    expect(onExpandedChange).toHaveBeenCalledWith(new Set(["a"]));
    expect(toggle("Second").props.accessibilityState.expanded).toBe(true);
    expect(toggle("First").props.accessibilityState.expanded).toBe(false);
  });

  test("isDisabled blocks every item", () => {
    render(<Sample isDisabled />);
    fireEvent.press(toggle("First"));
    expect(toggle("First").props.accessibilityState.expanded).toBe(false);
    expect(toggle("Second").props.accessibilityState.disabled).toBe(true);
  });
});
