import { DIVIDER_SIZES, type DividerSize } from "@moonx/ui-tokens";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export interface DividerProps {
  size?: DividerSize;
  orientation?: "horizontal" | "vertical";
}

/** A hairline separator; the thickness follows `size` (`semantic.border-width.divider`). */
export function Divider({ size = "S", orientation = "horizontal" }: DividerProps) {
  styles.useVariants({ orientation, size });
  return <View role="separator" style={styles.divider} />;
}

const styles = StyleSheet.create((theme) => ({
  divider: {
    flexShrink: 0,
    alignSelf: "stretch",
    backgroundColor: theme.color.border.hairline,
    variants: {
      orientation: { horizontal: {}, vertical: {} },
      size: { S: {}, M: {}, L: {} },
    },
    compoundVariants: [
      ...DIVIDER_SIZES.map((size) => ({
        orientation: "horizontal" as const,
        size,
        styles: { height: theme["border-width"].divider[size] },
      })),
      ...DIVIDER_SIZES.map((size) => ({
        orientation: "vertical" as const,
        size,
        styles: { width: theme["border-width"].divider[size] },
      })),
    ],
  },
}));
