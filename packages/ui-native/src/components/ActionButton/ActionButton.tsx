import type { ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";

interface ActionButtonBase {
  size?: ComponentSize;
  /** Drops the filled background; for toolbars where the buttons should recede. */
  isQuiet?: boolean;
  isDisabled?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** A text button, optionally with an icon before the text. */
interface ActionButtonWithText extends ActionButtonBase {
  children: ReactNode;
  icon?: ReactNode;
  "aria-label"?: string;
}

/** An icon alone. The accessible name is required because nothing else names the button. */
interface ActionButtonIconOnly extends ActionButtonBase {
  icon: ReactNode;
  children?: undefined;
  "aria-label": string;
}

/**
 * Same props as the Web part. The React Aria link and form props (`href`, `type`, `form`,
 * `autoFocus` and the like) have no meaning on a phone and are not accepted.
 */
export type ActionButtonProps = ActionButtonWithText | ActionButtonIconOnly;

export interface ActionButtonPressableProps {
  size: ComponentSize;
  isQuiet: boolean;
  isDisabled: boolean;
  /** Set by `ActionGroup` for a pressed toggle item. */
  isSelected?: boolean;
  role: "button" | "radio" | "checkbox";
  /** Reported as `aria-checked`; only toggle roles carry it. */
  checked?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
  "aria-label"?: string;
  testID?: string;
}

/** The pressable shared by `ActionButton` and `ActionGroupItem`. Not part of the public API. */
export function ActionButtonPressable({
  size,
  isQuiet,
  isDisabled,
  isSelected = false,
  role,
  checked,
  icon,
  children,
  onPress,
  testID,
  "aria-label": ariaLabel,
}: ActionButtonPressableProps) {
  const iconOnly = children === undefined || children === null;
  styles.useVariants({
    size,
    quiet: isQuiet,
    disabled: isDisabled,
    selected: isSelected,
    iconOnly,
  });
  return (
    <Pressable
      role={role}
      aria-label={ariaLabel}
      aria-disabled={isDisabled}
      aria-checked={checked}
      testID={testID}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => styles.button(pressed)}
    >
      <Content textStyle={styles.label} iconSize={styles.icon.width}>
        {icon ? <View aria-hidden>{icon}</View> : null}
        {children}
      </Content>
    </Pressable>
  );
}

/**
 * A text button, optionally with an icon before the text, or an icon alone. The touch target is
 * at least `target-min` high; an icon-only button is at least that wide too.
 */
export function ActionButton({
  size = "M",
  isQuiet = false,
  isDisabled = false,
  icon,
  children,
  ...props
}: ActionButtonProps) {
  return (
    <ActionButtonPressable
      {...props}
      role="button"
      size={size}
      isQuiet={isQuiet}
      isDisabled={isDisabled}
      icon={icon}
    >
      {children}
    </ActionButtonPressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const tokens = theme.scale.component["action-button"];
  const target = theme.scale.component["target-min"];
  const colors = theme.color;
  const sizes = ["S", "M", "L", "XL"] as const;
  return {
    button: (pressed: boolean) => ({
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space["75"],
      borderRadius: theme.radius.control,
      variants: {
        quiet: {
          true: { backgroundColor: pressed ? colors.control.secondary : "transparent" },
          false: {
            backgroundColor: pressed
              ? colors.control["secondary-pressed"]
              : colors.control.secondary,
          },
        },
        selected: { true: {}, false: {} },
        disabled: { true: {}, false: {} },
        iconOnly: { true: {}, false: {} },
        size: sizeVariants((s) => ({ minHeight: atLeastTarget(tokens.height[s], target) })),
      },
      compoundVariants: [
        {
          quiet: false,
          selected: true,
          styles: {
            backgroundColor: pressed ? colors.control["primary-pressed"] : colors.control.primary,
          },
        },
        { quiet: true, selected: true, styles: { backgroundColor: colors.surface.selected } },
        { quiet: false, disabled: true, styles: { backgroundColor: colors.control.disabled } },
        { quiet: true, disabled: true, styles: { backgroundColor: "transparent" } },
        ...sizes.flatMap((size) => [
          {
            size,
            iconOnly: false,
            styles: { paddingHorizontal: tokens["padding-x"][size] },
          },
          {
            size,
            iconOnly: true,
            styles: {
              padding: tokens["padding-icon-only"][size],
              minWidth: atLeastTarget(tokens.height[size], target),
            },
          },
        ]),
      ],
    }),
    label: {
      ...fontStyle(theme, "button"),
      color: colors.control["on-secondary"],
      variants: {
        quiet: { true: { color: colors.text.primary }, false: {} },
        selected: { true: {}, false: {} },
        disabled: { true: {}, false: {} },
        size: sizeVariants((s) => ({ fontSize: theme.scale.component.button["font-size"][s] })),
      },
      compoundVariants: [
        { quiet: false, selected: true, styles: { color: colors.control["on-primary"] } },
        { disabled: true, styles: { color: colors.text.disabled } },
      ],
    },
    icon: {
      width: theme.scale.component.icon.size.M,
      variants: { size: sizeVariants((s) => ({ width: theme.scale.component.icon.size[s] })) },
    },
  };
});
