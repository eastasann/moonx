import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Text as NativeText, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";

export interface IllustratedMessageProps {
  /** A Lucide icon component from `lucide-react-native`, e.g. `Inbox`. Decorative. */
  icon: LucideIcon;
  heading: ReactNode;
  /** Shown under the heading as running text, so pass inline content only. */
  children?: ReactNode;
  /** Slot for the next step, usually a Button or a Link. */
  actions?: ReactNode;
  /** The heading's level in the screen outline. */
  headingLevel?: 2 | 3 | 4;
}

/** The empty, zero-result, no-permission and not-found states (design-spec 6.0.6). */
export function IllustratedMessage({
  icon: Icon,
  heading,
  children,
  actions,
  headingLevel = 2,
}: IllustratedMessageProps) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.message}>
      <View aria-hidden>
        <Icon
          size={theme.space["700"]}
          color={theme.color.text.secondary}
          strokeWidth={theme.icon["stroke-width"]}
        />
      </View>
      <NativeText role="heading" aria-level={headingLevel} style={styles.heading}>
        {heading}
      </NativeText>
      {children ? <NativeText style={styles.description}>{children}</NativeText> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  message: {
    alignSelf: "center",
    alignItems: "center",
    gap: theme.space["200"],
    maxWidth: theme.layout["reading-column-max"],
    padding: theme.space["500"],
  },
  // Not the Heading part: it has no text alignment, and a multi-line title must be centered.
  heading: {
    ...fontStyle(theme, "heading-3"),
    color: theme.color.text.primary,
    textAlign: "center",
  },
  description: {
    ...fontStyle(theme, "body"),
    color: theme.color.text.secondary,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.space["100"],
    marginTop: theme.space["100"],
  },
}));
