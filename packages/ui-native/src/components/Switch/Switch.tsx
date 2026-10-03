import type { ComponentSize } from "@moonx/ui-tokens";
import * as SwitchPrimitive from "@rn-primitives/switch";
import { type ReactNode, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { FieldHelp, fieldAccessibility } from "../../internal/FieldParts";
import { sizeVariants } from "../../internal/sizes";
import { timingConfig } from "../../internal/timing";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";
import { useReducedMotion } from "../../internal/useReducedMotion";

export interface SwitchProps {
  /** Required. Its text is the switch's accessible name. */
  children: ReactNode;
  description?: ReactNode;
  size?: ComponentSize;
  isSelected?: boolean;
  defaultSelected?: boolean;
  onChange?: (isSelected: boolean) => void;
  isDisabled?: boolean;
  /** Keeps the current state and ignores presses. */
  isReadOnly?: boolean;
  "aria-label"?: string;
  testID?: string;
}

/** A switch applies at once, so it has no required or invalid state. */
export function Switch({
  children,
  description,
  size = "M",
  isSelected,
  defaultSelected = false,
  onChange,
  isDisabled = false,
  isReadOnly = false,
  "aria-label": ariaLabel,
  testID,
}: SwitchProps) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const [selected, setSelected] = useControlledState(isSelected, defaultSelected, onChange);
  styles.useVariants({ size, selected, disabled: isDisabled });

  const t = theme.scale.component.switch;
  const height = t["control-height"][size];
  const width = t["control-width"][size];
  const rest = t["handle-size"][size];
  const on = t["handle-size-selected"][size];
  const progress = useSharedValue(selected ? 1 : 0);
  const motion = theme.motion.transition.hover;
  useEffect(() => {
    const target = selected ? 1 : 0;
    progress.value = reduced ? target : withTiming(target, timingConfig(motion));
  }, [selected, reduced, motion, progress]);

  const handle = useAnimatedStyle(() => {
    const d = interpolate(progress.value, [0, 1], [rest, on]);
    const inset = (height - d) / 2;
    return {
      width: d,
      height: d,
      top: inset,
      left: interpolate(
        progress.value,
        [0, 1],
        [(height - rest) / 2, width - on - (height - on) / 2],
      ),
    };
  });

  return (
    <View style={styles.wrapper}>
      <SwitchPrimitive.Root
        checked={selected}
        onCheckedChange={(next) => {
          if (!isReadOnly) setSelected(next);
        }}
        disabled={isDisabled}
        testID={testID}
        {...fieldAccessibility({ label: "", description })}
        aria-label={ariaLabel}
        aria-valuetext={undefined}
        style={styles.row}
      >
        <View style={styles.track}>
          <Animated.View style={[styles.handle, handle]} />
        </View>
        <Content textStyle={styles.label} iconSize={theme.scale.component.icon.size.S}>
          {children}
        </Content>
      </SwitchPrimitive.Root>
      {description ? (
        <View style={styles.help}>
          <FieldHelp description={description} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const t = theme.scale.component.switch;
  const color = theme.color;
  return {
    wrapper: { alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["100"],
      minHeight: theme.scale.component["target-min"],
    },
    track: {
      flexShrink: 0,
      borderRadius: theme.radius.pill,
      backgroundColor: color.control.track,
      variants: {
        size: sizeVariants((s) => ({
          width: t["control-width"][s],
          height: t["control-height"][s],
        })),
        selected: { true: { backgroundColor: color.control["track-fill"] }, false: {} },
        disabled: { true: { backgroundColor: color.control.disabled }, false: {} },
      },
    },
    handle: {
      position: "absolute",
      borderRadius: theme.radius.pill,
      backgroundColor: color.surface.raised,
      variants: { disabled: { true: { backgroundColor: color.text.disabled }, false: {} } },
    },
    label: {
      ...fontStyle(theme, "body"),
      color: color.text.primary,
      variants: {
        size: sizeVariants((s) => ({ fontSize: theme.scale.component.field["font-size"][s] })),
        disabled: { true: { color: color.text.disabled }, false: {} },
      },
    },
    help: {
      variants: {
        size: sizeVariants((s) => ({ marginLeft: t["control-width"][s] + theme.space["100"] })),
      },
    },
  };
});
