import type { ButtonVariant, ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { ProgressCircle } from "../ProgressCircle";

interface ButtonBaseProps {
  /** `accent` is for the one main action of a screen. `negative` is only for confirming a deletion. */
  variant?: ButtonVariant;
  size?: ComponentSize;
  isDisabled?: boolean;
  onPress?: () => void;
  "aria-label"?: string;
  testID?: string;
  children?: ReactNode;
}

interface IdleProps {
  isPending?: false;
  pendingLabel?: string;
}

interface PendingProps {
  /**
   * Shows a spinner before the label and turns presses off (the button gets `aria-disabled`)
   * while a submit is in flight (design-spec 6.0.6).
   */
  isPending: true;
  /** Accessible name of the spinner, such as "Saving". Required while `isPending`. */
  pendingLabel: string;
}

export type ButtonProps = ButtonBaseProps & (IdleProps | PendingProps);

export function Button({
  variant = "primary",
  size = "M",
  isDisabled = false,
  isPending = false,
  pendingLabel,
  onPress,
  children,
  testID,
  "aria-label": ariaLabel,
}: ButtonProps) {
  styles.useVariants({ variant, size, disabled: isDisabled });
  const blocked = isDisabled || isPending;
  return (
    <Pressable
      role="button"
      aria-label={ariaLabel}
      aria-disabled={blocked}
      aria-busy={isPending}
      testID={testID}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => styles.button(pressed)}
    >
      <Content textStyle={styles.label} iconSize={styles.icon.width}>
        {isPending ? (
          <ProgressCircle size="S" isIndeterminate aria-label={pendingLabel ?? ""} />
        ) : null}
        {children}
      </Content>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const button = theme.scale.component.button;
  const colors = theme.color;
  return {
    button: (pressed: boolean) => ({
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space["100"],
      borderRadius: theme.radius.control,
      backgroundColor: colors.control.primary,
      variants: {
        variant: {
          accent: { backgroundColor: pressed ? colors.accent.pressed : colors.accent.default },
          primary: {
            backgroundColor: pressed ? colors.control["primary-pressed"] : colors.control.primary,
          },
          secondary: {
            backgroundColor: pressed
              ? colors.control["secondary-pressed"]
              : colors.control.secondary,
          },
          negative: {
            backgroundColor: pressed ? colors.negative["strong-pressed"] : colors.negative.strong,
          },
        },
        size: sizeVariants((s) => ({
          minHeight: atLeastTarget(button.height[s], theme.scale.component["target-min"]),
          paddingHorizontal: button["padding-x"][s],
        })),
        disabled: { true: { backgroundColor: colors.control.disabled }, false: {} },
      },
    }),
    label: {
      ...fontStyle(theme, "button"),
      color: colors.control["on-primary"],
      variants: {
        variant: {
          accent: { color: colors.text["on-accent"] },
          primary: { color: colors.control["on-primary"] },
          secondary: { color: colors.control["on-secondary"] },
          negative: { color: colors.negative["on-strong"] },
        },
        size: sizeVariants((s) => ({ fontSize: button["font-size"][s] })),
        disabled: { true: { color: colors.text.disabled }, false: {} },
      },
    },
    icon: { width: theme.scale.component.icon.size.S },
  };
});
