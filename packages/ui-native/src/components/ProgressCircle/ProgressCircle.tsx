import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useReducedMotion } from "../../internal/useReducedMotion";

export interface ProgressCircleProps {
  /** Required: a circle has no visible label. */
  "aria-label": string;
  /** Spoken value, e.g. "40%". Formatted by the screen with the i18n helpers. */
  valueLabel?: string;
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** For work whose progress is unknown, e.g. a sending button. `value` is ignored. */
  isIndeterminate?: boolean;
  size?: "S" | "M" | "L";
}

// Geometry of the SVG viewBox, not a style value: the drawn size follows the style box.
const VIEW = 32;
const STROKE = 4;
const RADIUS = (VIEW - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const INDETERMINATE_ARC = 25;

export function ProgressCircle({
  "aria-label": ariaLabel,
  valueLabel,
  value = 0,
  minValue = 0,
  maxValue = 100,
  isIndeterminate = false,
  size = "M",
}: ProgressCircleProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ size });
  const span = maxValue - minValue;
  const percentage = span > 0 ? Math.min(100, Math.max(0, ((value - minValue) / span) * 100)) : 0;
  const shown = isIndeterminate ? INDETERMINATE_ARC : percentage;
  const rotation = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!isIndeterminate || reduced) {
      cancelAnimation(rotation);
      rotation.value = 0;
      return;
    }
    rotation.value = withRepeat(
      withTiming(360, {
        duration: theme.motion.loop.spin,
        easing: Easing.linear,
      }),
      -1,
    );
    return () => cancelAnimation(rotation);
  }, [isIndeterminate, reduced, rotation, theme.motion.loop.spin]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={ariaLabel}
      accessibilityValue={
        isIndeterminate ? {} : { min: minValue, max: maxValue, now: value, text: valueLabel }
      }
      style={styles.box}
    >
      <Animated.View style={[styles.fill, spin]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW} ${VIEW}`}>
          <Circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            stroke={theme.color.control.track}
            fill="none"
          />
          <Circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            stroke={theme.color.control["track-fill"]}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(shown / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${VIEW / 2} ${VIEW / 2})`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    variants: {
      size: {
        S: { width: theme.space["300"], height: theme.space["300"] },
        M: { width: theme.space["500"], height: theme.space["500"] },
        L: { width: theme.space["800"], height: theme.space["800"] },
      },
    },
  },
  fill: { width: "100%", height: "100%" },
}));
