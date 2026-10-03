import type { ReactNode } from "react";
import { Text as NativeText } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";

export type HeadingVariant = "display" | "heading-1" | "heading-2" | "heading-3" | "heading-4";

export interface HeadingProps {
  /** The heading's level in the screen outline (`aria-level`); also picks the look unless `variant` is given. */
  level: 1 | 2 | 3 | 4;
  /** The look. `display` is for the landing page title. */
  variant?: HeadingVariant;
  id?: string;
  children: ReactNode;
}

/** A screen or section title in the display typeface. */
export function Heading({ level, variant, id, children }: HeadingProps) {
  styles.useVariants({ variant: variant ?? `heading-${level}` });
  return (
    <NativeText role="heading" aria-level={level} nativeID={id} style={styles.heading}>
      {children}
    </NativeText>
  );
}

const styles = StyleSheet.create((theme) => ({
  heading: {
    ...fontStyle(theme, "heading-1"),
    color: theme.color.text.primary,
    variants: {
      variant: {
        display: fontStyle(theme, "display"),
        "heading-1": fontStyle(theme, "heading-1"),
        "heading-2": fontStyle(theme, "heading-2"),
        "heading-3": fontStyle(theme, "heading-3"),
        "heading-4": fontStyle(theme, "heading-4"),
      },
    },
  },
}));
