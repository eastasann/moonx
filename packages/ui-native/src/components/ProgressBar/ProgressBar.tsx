import type { ComponentSize } from "@moonx/ui-tokens";
import { type ReactNode, useEffect, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { textOf } from "../../internal/FieldParts";
import { sizeVariants } from "../../internal/sizes";
import { timingConfig } from "../../internal/timing";
import { fontStyle } from "../../internal/typography";
import { useReducedMotion } from "../../internal/useReducedMotion";

export interface ProgressBarProps {
  /** What is in progress, e.g. "Preparing PDF…". Shown above the bar and used as its name. */
  label: ReactNode;
  /** The value text, e.g. "40%". Formatted by the screen with the i18n helpers; also the spoken value. */
  valueLabel?: string;
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** For work whose progress is unknown. `value` is ignored. */
  isIndeterminate?: boolean;
  size?: ComponentSize;
  testID?: string;
}

/** Share of the track the sliding fill covers while indeterminate; the same as the Web part. */
const INDETERMINATE_SHARE = 0.4;

export function ProgressBar({
  label,
  valueLabel,
  value = 0,
  minValue = 0,
  maxValue = 100,
  isIndeterminate = false,
  size = "M",
  testID,
}: ProgressBarProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ size });
  const span = maxValue - minValue;
  const percentage = span > 0 ? Math.min(100, Math.max(0, ((value - minValue) / span) * 100)) : 0;
  const [trackWidth, setTrackWidth] = useState(0);
  const reduced = useReducedMotion();

  const width = useSharedValue(percentage);
  const slide = useSharedValue(0);

  useEffect(() => {
    if (isIndeterminate) return;
    width.value = reduced
      ? percentage
      : withTiming(percentage, timingConfig(theme.motion.transition.expand));
  }, [isIndeterminate, percentage, reduced, theme.motion.transition.expand, width]);

  useEffect(() => {
    if (!isIndeterminate) {
      cancelAnimation(slide);
      slide.value = 0;
      return;
    }
    // Keeps sliding under reduced motion, as the Web part does: the movement is the only signal
    // that work is in progress, and a static bar would read as a stalled value.
    slide.value = withRepeat(
      withTiming(1, { duration: theme.motion.loop.indeterminate, easing: Easing.linear }),
      -1,
    );
    return () => cancelAnimation(slide);
  }, [isIndeterminate, slide, theme.motion.loop.indeterminate]);

  const valueStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  const slideStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          slide.value,
          [0, 1],
          [-INDETERMINATE_SHARE * trackWidth, trackWidth],
        ),
      },
    ],
  }));

  return (
    <View
      accessible
      role="progressbar"
      aria-label={textOf(label)}
      accessibilityValue={
        isIndeterminate ? {} : { min: minValue, max: maxValue, now: value, text: valueLabel }
      }
      testID={testID}
      style={styles.root}
    >
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {valueLabel && !isIndeterminate ? <Text style={styles.value}>{valueLabel}</Text> : null}
      </View>
      <View
        style={styles.track}
        onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        {isIndeterminate ? (
          <Animated.View style={[styles.fill, styles.fillSliding, slideStyle]} />
        ) : (
          <Animated.View style={[styles.fill, valueStyle]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { alignSelf: "stretch", gap: theme.space["75"] },
  header: { flexDirection: "row", justifyContent: "space-between", gap: theme.space["200"] },
  label: { ...fontStyle(theme, "label"), color: theme.color.text.primary },
  value: { ...fontStyle(theme, "number"), color: theme.color.text.secondary },
  track: {
    overflow: "hidden",
    alignSelf: "stretch",
    backgroundColor: theme.color.control.track,
    borderRadius: theme.radius.pill,
    variants: {
      size: sizeVariants((s) => ({ height: theme.scale.component.meter.thickness[s] })),
    },
  },
  fill: {
    height: "100%",
    backgroundColor: theme.color.control["track-fill"],
    borderRadius: theme.radius.pill,
  },
  fillSliding: { position: "absolute", top: 0, left: 0, width: `${INDETERMINATE_SHARE * 100}%` },
}));
