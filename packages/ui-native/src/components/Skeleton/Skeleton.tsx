import { type SpaceName, type SpaceStep, spaceStep } from "@moonx/ui-tokens";
import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useReducedMotion } from "../../internal/useReducedMotion";

export interface SkeletonProps {
  /** `text` is one line of text, `block` a box (give it a `height`), `circle` an Avatar M. */
  shape?: "text" | "block" | "circle";
  /** Width as a space token; full width when omitted. Ignored for `circle`. */
  width?: SpaceName;
  /** Height as a space token. Ignored for `circle`; `text` follows the body font size. */
  height?: SpaceName;
}

/** Lowest opacity of the pulse, the same value as the Web part's keyframes. */
const PULSE_LOW = 0.5;

/**
 * A placeholder shape for content that is loading. It is hidden from assistive technology: the
 * screen marks the loading region with `aria-busy` and names it. The pulse is decoration on top
 * of a shape that already says "loading", so it stops under reduced motion.
 */
export function Skeleton({ shape = "text", width, height }: SkeletonProps) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  styles.useVariants({ shape });

  useEffect(() => {
    if (reduced) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withTiming(PULSE_LOW, {
        duration: theme.motion.loop.pulse / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [reduced, opacity, theme.motion.loop.pulse]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sized = shape !== "circle";
  const widthStep: SpaceStep | undefined = sized && width ? spaceStep(width) : undefined;
  const heightStep: SpaceStep | undefined =
    sized && shape === "block" && height ? spaceStep(height) : undefined;
  return <Animated.View aria-hidden style={[styles.skeleton(widthStep, heightStep), pulse]} />;
}

const styles = StyleSheet.create((theme) => ({
  skeleton: (width?: SpaceStep, height?: SpaceStep) => ({
    backgroundColor: theme.color.control.track,
    variants: {
      shape: {
        text: {
          alignSelf: width ? "flex-start" : "stretch",
          height: theme.typography.body.fontSize,
          borderRadius: theme.radius.chip,
        },
        block: {
          alignSelf: width ? "flex-start" : "stretch",
          borderRadius: theme.radius.card,
        },
        circle: {
          alignSelf: "flex-start",
          width: theme.scale.component.avatar.size.M,
          height: theme.scale.component.avatar.size.M,
          borderRadius: theme.radius.pill,
        },
      },
    },
    ...(width ? { width: theme.space[width] } : {}),
    ...(height ? { height: theme.space[height] } : {}),
  }),
}));
