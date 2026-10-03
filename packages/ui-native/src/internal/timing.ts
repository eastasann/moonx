import { Easing, type WithTimingConfig } from "react-native-reanimated";

/** A `semantic.motion.transition` entry as the generated theme carries it. */
interface Transition {
  duration: number;
  easing: readonly number[];
}

/** Turns a theme transition into the config `withTiming` takes. */
export function timingConfig(transition: Transition): WithTimingConfig {
  const [x1, y1, x2, y2] = transition.easing as [number, number, number, number];
  return { duration: transition.duration, easing: Easing.bezier(x1, y1, x2, y2) };
}
