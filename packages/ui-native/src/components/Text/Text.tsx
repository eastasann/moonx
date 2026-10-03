import type { ReactNode } from "react";
import { Text as NativeText } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";

export interface TextProps {
  /** `body-long` has the wider line spacing for answers and other long reading. */
  variant?: "body" | "body-long" | "body-sm" | "caption" | "label";
  tone?: "primary" | "secondary" | "negative";
  id?: string;
  children: ReactNode;
}

/** Running text in the body typeface. Unlike the Web part, it has no `as`: there are no tags. */
export function Text({ variant = "body", tone = "primary", id, children }: TextProps) {
  styles.useVariants({ variant, tone });
  return (
    <NativeText nativeID={id} style={styles.text}>
      {children}
    </NativeText>
  );
}

const styles = StyleSheet.create((theme) => ({
  text: {
    ...fontStyle(theme, "body"),
    color: theme.color.text.primary,
    variants: {
      variant: {
        body: fontStyle(theme, "body"),
        "body-long": fontStyle(theme, "body-long"),
        "body-sm": fontStyle(theme, "body-sm"),
        caption: fontStyle(theme, "caption"),
        label: fontStyle(theme, "label"),
      },
      tone: {
        primary: { color: theme.color.text.primary },
        secondary: { color: theme.color.text.secondary },
        negative: { color: theme.color.negative.fg },
      },
    },
  },
}));
