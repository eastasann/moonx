import { themes } from "@moonx/ui-tokens/native";
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import * as Reanimated from "react-native-reanimated";
import { Skeleton } from "../src/components/Skeleton";

afterEach(() => jest.restoreAllMocks());

const style = () => {
  const root = screen.toJSON() as unknown as { props: { style: unknown } };
  return Object.assign({}, ...[root.props.style].flat(Infinity).filter(Boolean)) as Record<
    string,
    unknown
  >;
};

test("is hidden from assistive technology", () => {
  render(<Skeleton />);
  expect(
    (screen.toJSON() as unknown as { props: Record<string, unknown> }).props["aria-hidden"],
  ).toBe(true);
});

test("text is one body-sized line at full width", () => {
  render(<Skeleton />);
  expect(style().height).toBe(themes.light.typography.body.fontSize);
  expect(style().width).toBeUndefined();
  expect(style().alignSelf).toBe("stretch");
});

test("width and height are space tokens; block takes both", () => {
  render(<Skeleton shape="block" width="space-800" height="space-600" />);
  expect(style().width).toBe(themes.light.space["800"]);
  expect(style().height).toBe(themes.light.space["600"]);
});

test("text takes a width but ignores height", () => {
  render(<Skeleton width="space-700" height="space-900" />);
  expect(style().width).toBe(themes.light.space["700"]);
  expect(style().height).toBe(themes.light.typography.body.fontSize);
});

test("circle is an Avatar M and ignores width and height", () => {
  render(<Skeleton shape="circle" width="space-900" height="space-900" />);
  const size = themes.light.scale.component.avatar.size.M;
  expect(style().width).toBe(size);
  expect(style().height).toBe(size);
  expect(style().borderRadius).toBe(themes.light.radius.pill);
});

test("pulses with the pulse duration", async () => {
  const withTiming = jest.spyOn(Reanimated, "withTiming");
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  render(<Skeleton />);
  await act(async () => {});
  expect(withRepeat).toHaveBeenCalled();
  expect(withTiming.mock.calls[0]?.[1]).toMatchObject({
    duration: themes.light.motion.loop.pulse / 2,
  });
});

test("stops when the OS asks for reduced motion and starts again when it does not", async () => {
  let notify: (reduced: boolean) => void = () => {};
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_event, handler) => {
    notify = handler as unknown as (reduced: boolean) => void;
    return { remove: () => {} } as never;
  });
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  const cancelAnimation = jest.spyOn(Reanimated, "cancelAnimation");
  render(<Skeleton />);
  await act(async () => {});
  expect(withRepeat).toHaveBeenCalledTimes(1);

  withRepeat.mockClear();
  cancelAnimation.mockClear();
  await act(async () => notify(true));
  expect(withRepeat).not.toHaveBeenCalled();
  expect(cancelAnimation).toHaveBeenCalled();

  await act(async () => notify(false));
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

test("starts without a pulse when reduced motion is already on", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const withRepeat = jest.spyOn(Reanimated, "withRepeat");
  render(<Skeleton />);
  await act(async () => {});
  withRepeat.mockClear();
  await act(async () => {});
  expect(withRepeat).not.toHaveBeenCalled();
});
