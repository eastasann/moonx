import type { ReactNode } from "react";
import { Text as NativeText, Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";

export interface LinkProps {
  /**
   * `primary` is a link on its own line or in a list and keeps the minimum tap target.
   * `secondary` is for links inside running text that should not draw the eye; it is a nested
   * `Text` that flows with the surrounding text and is exempt from the target size.
   */
  variant?: "primary" | "secondary";
  isDisabled?: boolean;
  onPress?: () => void;
  id?: string;
  "aria-label"?: string;
  testID?: string;
  /** Text of the link. `secondary` is nested in a `Text`, so pass a string there. */
  children: ReactNode;
}

/**
 * A pressable `role="link"`. Unlike the Web part it has no `href`: navigation on the phone is
 * the Expo Router link's job, which wraps this part or is called from `onPress`.
 */
export function Link({
  variant = "primary",
  isDisabled = false,
  onPress,
  id,
  testID,
  children,
  "aria-label": ariaLabel,
}: LinkProps) {
  styles.useVariants({ variant, disabled: isDisabled });
  if (variant === "secondary") {
    return (
      <NativeText
        role="link"
        aria-label={ariaLabel}
        aria-disabled={isDisabled}
        nativeID={id}
        testID={testID}
        onPress={isDisabled ? undefined : onPress}
        style={styles.inline(false)}
      >
        {children}
      </NativeText>
    );
  }
  return (
    <Pressable
      role="link"
      aria-label={ariaLabel}
      aria-disabled={isDisabled}
      nativeID={id}
      testID={testID}
      disabled={isDisabled}
      onPress={onPress}
      style={styles.link}
    >
      {({ pressed }) => (
        <Content textStyle={styles.inline(pressed)} iconSize={styles.icon.width}>
          {children}
        </Content>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  link: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: theme.scale.component["target-min"],
    borderRadius: theme.radius.chip,
  },
  inline: (pressed: boolean) => ({
    color: pressed ? theme.color.text.primary : theme.color.text.link,
    textDecorationLine: "underline",
    variants: {
      variant: {
        primary: {
          fontSize: theme.typography.body.fontSize,
          lineHeight: theme.typography.body.lineHeight,
        },
        secondary: { color: pressed ? theme.color.text.primary : theme.color.text.secondary },
      },
      disabled: {
        true: { color: theme.color.text.disabled, textDecorationLine: "none" },
        false: {},
      },
    },
  }),
  icon: { width: theme.scale.component.icon.size.S },
}));
