import { CircleQuestionMark, Info } from "lucide-react-native";
import type { ReactNode } from "react";
import { Text as NativeText, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";
import type { ResponsivePopoverProps } from "../ResponsivePopover";
import { Tray } from "../Tray";

export interface ContextualHelpProps {
  /** `help` is for how to fill in a field (a question mark); `info` is for background (an i). */
  variant?: "help" | "info";
  /** Accessible name of the icon button that opens the help. */
  label: string;
  /** Heading inside the help; it is also the accessible name of the tray. */
  title: string;
  children: ReactNode;
  /** Accepted and ignored: the help is always a tray on the phone. */
  placement?: ResponsivePopoverProps["placement"];
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  testID?: string;
}

interface HelpTriggerProps {
  variant: "help" | "info";
  label: string;
  testID?: string;
  onPress?: () => void;
}

function HelpTrigger({ variant, label, testID, onPress }: HelpTriggerProps) {
  const Icon = variant === "help" ? CircleQuestionMark : Info;
  return (
    <Pressable
      role="button"
      aria-label={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => styles.trigger(pressed)}
    >
      <Icon
        aria-hidden
        color={styles.icon.color}
        size={styles.icon.width}
        strokeWidth={styles.icon.strokeWidth}
      />
    </Pressable>
  );
}

/** An icon button that opens a short explanation in a tray. */
export function ContextualHelp({
  variant = "help",
  label,
  title,
  children,
  placement: _placement,
  testID,
  ...openState
}: ContextualHelpProps) {
  return (
    <Tray
      trigger={<HelpTrigger variant={variant} label={label} testID={testID} />}
      aria-label={title}
      {...openState}
    >
      <View style={styles.content}>
        <NativeText role="heading" aria-level={3} style={styles.title}>
          {title}
        </NativeText>
        <Content textStyle={styles.body} iconSize={styles.icon.width}>
          {children}
        </Content>
      </View>
    </Tray>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: (pressed: boolean) => ({
    alignItems: "center",
    justifyContent: "center",
    minWidth: theme.scale.component["target-min"],
    minHeight: theme.scale.component["target-min"],
    borderRadius: theme.radius.pill,
    backgroundColor: pressed ? theme.color.surface.sunken : "transparent",
  }),
  icon: {
    width: theme.scale.component.icon.size.M,
    color: theme.color.text.secondary,
    strokeWidth: theme.icon["stroke-width"],
  },
  content: { gap: theme.space["100"], paddingVertical: theme.space["100"] },
  title: { ...fontStyle(theme, "heading-4"), color: theme.color.text.primary },
  body: { ...fontStyle(theme, "body-sm"), color: theme.color.text.primary },
}));
