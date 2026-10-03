import { act, fireEvent, render, screen } from "@testing-library/react-native";
import {
  Keyboard,
  type KeyboardEventName,
  Platform,
  ScrollView,
  Text,
  TextInput,
} from "react-native";
import { KeyboardSafeArea } from "../src/components/Form";
import { TextField } from "../src/components/TextField";

type Rect = { x: number; y: number; width: number; height: number };
const mockRects = new Map<string, Rect>();

jest.mock("../src/internal/measure", () => ({
  measureInWindow: (node: { props?: { testID?: string }; rect?: Rect }) =>
    Promise.resolve(mockRects.get(node.props?.testID ?? "") ?? node.rect),
}));

const handlers = new Map<string, (event?: unknown) => void>();
const removed: string[] = [];
const rect = (y: number, height: number): Rect => ({ x: 0, y, width: 390, height });

let originalOS: typeof Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  originalOS = Platform.OS;
  handlers.clear();
  removed.length = 0;
  mockRects.clear();
  mockRects.set("ksa", rect(0, 800));
  mockRects.set("ksa-scroll", rect(0, 740));
  jest.spyOn(Keyboard, "addListener").mockImplementation(((name: KeyboardEventName, fn: never) => {
    handlers.set(name, fn);
    return { remove: () => removed.push(name) };
  }) as never);
  jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue(null as never);
});
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

const show = (name: string, screenY: number) =>
  act(async () => {
    handlers.get(name)?.({ endCoordinates: { screenY, height: 800 - screenY } });
  });
const hide = (name: string) =>
  act(async () => {
    handlers.get(name)?.();
  });
const container = () => screen.getByTestId("ksa");
const scrollTo = () => {
  const instance = screen.UNSAFE_getByType(ScrollView).instance as { scrollTo: jest.Mock };
  return instance.scrollTo;
};
const focusInput = (inputRect: Rect) =>
  jest.mocked(TextInput.State.currentlyFocusedInput).mockReturnValue({ rect: inputRect } as never);

function renderArea() {
  return render(
    <KeyboardSafeArea testID="ksa" footer={<Text>Saved</Text>}>
      <TextField label="Name" />
    </KeyboardSafeArea>,
  );
}

test("renders its children and the footer", () => {
  renderArea();
  expect(screen.getByLabelText("Name")).toBeTruthy();
  expect(screen.getByText("Saved")).toBeTruthy();
});

test("iOS: lifts the whole body (footer included) by the part of the keyboard that covers it", async () => {
  Platform.OS = "ios";
  renderArea();
  expect(container().props.style.paddingBottom).toBe(0);
  await show("keyboardWillChangeFrame", 500);
  expect(container().props.style.paddingBottom).toBe(300);
  await show("keyboardWillChangeFrame", 450);
  expect(container().props.style.paddingBottom).toBe(350);
  await hide("keyboardWillHide");
  expect(container().props.style.paddingBottom).toBe(0);
});

test("Android: listens to the did-events, and adds nothing when the window already shrank", async () => {
  Platform.OS = "android";
  renderArea();
  expect(handlers.has("keyboardDidShow")).toBe(true);
  expect(handlers.has("keyboardWillChangeFrame")).toBe(false);
  mockRects.set("ksa", rect(0, 500));
  await show("keyboardDidShow", 500);
  expect(container().props.style.paddingBottom).toBe(0);
  mockRects.set("ksa", rect(0, 800));
  await show("keyboardDidShow", 500);
  expect(container().props.style.paddingBottom).toBe(300);
  await hide("keyboardDidHide");
  expect(container().props.style.paddingBottom).toBe(0);
});

test("scrolls down when the focused input sits under the keyboard", async () => {
  Platform.OS = "ios";
  renderArea();
  focusInput(rect(450, 50));
  await show("keyboardWillChangeFrame", 500);
  expect(scrollTo()).toHaveBeenCalledTimes(1);
  const { y } = scrollTo().mock.calls[0][0];
  // The input's bottom (500) ends one margin (16) above the keyboard's top (500).
  expect(y).toBe(16);
});

test("takes the current scroll offset into account", async () => {
  Platform.OS = "ios";
  renderArea();
  fireEvent.scroll(screen.getByTestId("ksa-scroll"), {
    nativeEvent: { contentOffset: { x: 0, y: 200 } },
  });
  focusInput(rect(450, 50));
  await show("keyboardWillChangeFrame", 500);
  expect(scrollTo().mock.calls[0][0].y).toBeGreaterThan(200);
});

test("does not scroll when the input is already clear of the keyboard", async () => {
  Platform.OS = "ios";
  renderArea();
  focusInput(rect(100, 50));
  await show("keyboardWillChangeFrame", 500);
  expect(scrollTo()).not.toHaveBeenCalled();
});

test("scrolls up when the focused input is above the visible area", async () => {
  Platform.OS = "ios";
  renderArea();
  fireEvent.scroll(screen.getByTestId("ksa-scroll"), {
    nativeEvent: { contentOffset: { x: 0, y: 300 } },
  });
  focusInput(rect(-40, 50));
  await show("keyboardWillChangeFrame", 500);
  const { y } = scrollTo().mock.calls[0][0];
  expect(y).toBeLessThan(300);
  expect(y).toBeGreaterThanOrEqual(0);
});

test("moving focus to another input while the keyboard stays up reveals it", async () => {
  Platform.OS = "ios";
  renderArea();
  await show("keyboardWillChangeFrame", 500);
  expect(scrollTo()).not.toHaveBeenCalled();
  focusInput(rect(470, 50));
  await act(async () => {
    fireEvent(screen.getByLabelText("Name"), "focus");
  });
  expect(scrollTo()).toHaveBeenCalledTimes(1);
});

test("focusing an input while the keyboard is down does not scroll", async () => {
  Platform.OS = "ios";
  renderArea();
  focusInput(rect(470, 50));
  await act(async () => {
    fireEvent(screen.getByLabelText("Name"), "focus");
  });
  expect(scrollTo()).not.toHaveBeenCalled();
});

test("keeps taps on buttons working with the keyboard up and removes its listeners on unmount", () => {
  const { unmount } = renderArea();
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
  unmount();
  expect(removed.length).toBe(2);
});

test("a keyboard that hides while the measurement is in flight leaves no padding behind", async () => {
  Platform.OS = "ios";
  renderArea();
  let resolveRect: (value: Rect) => void = () => {};
  const measure = jest.requireMock("../src/internal/measure") as {
    measureInWindow: (node: unknown) => Promise<Rect | undefined>;
  };
  const original = measure.measureInWindow;
  measure.measureInWindow = () => new Promise((resolve) => (resolveRect = resolve));
  await act(async () => {
    handlers.get("keyboardWillChangeFrame")?.({ endCoordinates: { screenY: 500, height: 300 } });
  });
  await hide("keyboardWillHide");
  await act(async () => {
    resolveRect(rect(0, 800));
  });
  measure.measureInWindow = original;
  expect(container().props.style.paddingBottom).toBe(0);
});
