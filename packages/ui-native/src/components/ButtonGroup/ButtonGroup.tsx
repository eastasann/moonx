import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export interface ButtonGroupProps {
  orientation?: "horizontal" | "vertical";
  /** Where the buttons sit along the main axis (horizontal) or cross axis (vertical). */
  align?: "start" | "center" | "end";
  /** Names the group for assistive technology. */
  "aria-label"?: string;
  children: ReactNode;
}

/** Lays out Buttons with the standard gap. Each Button keeps its own variant and size. */
export function ButtonGroup({
  orientation = "horizontal",
  align = "start",
  children,
  "aria-label": ariaLabel,
}: ButtonGroupProps) {
  styles.useVariants({ orientation, align });
  return (
    <View role="group" aria-label={ariaLabel} style={styles.group}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  group: {
    flexWrap: "wrap",
    gap: theme.space["100"],
    variants: {
      orientation: {
        horizontal: { flexDirection: "row", alignItems: "center" },
        vertical: { flexDirection: "column", alignItems: "stretch" },
      },
      align: { start: {}, center: {}, end: {} },
    },
    compoundVariants: [
      { orientation: "horizontal", align: "start", styles: { justifyContent: "flex-start" } },
      { orientation: "horizontal", align: "center", styles: { justifyContent: "center" } },
      { orientation: "horizontal", align: "end", styles: { justifyContent: "flex-end" } },
      { orientation: "vertical", align: "start", styles: { alignItems: "flex-start" } },
      { orientation: "vertical", align: "center", styles: { alignItems: "center" } },
      { orientation: "vertical", align: "end", styles: { alignItems: "flex-end" } },
    ],
  },
}));
