import type { ReactNode } from "react";
import { Text as NativeText, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";

export interface MetricTileProps {
  /** What the number is, e.g. "Break-even". */
  label: string;
  /** The number as text, formatted by the screen with the i18n helpers, e.g. "₱450,000+" or "Empty". */
  value: string;
  /** The unit, a reason the number is missing or a warning, under the number. */
  note?: ReactNode;
}

/**
 * One key number: label, a large figure and an optional note, stacked. The tile is a labelled
 * group; screens place two per row (design-spec 4.5).
 */
export function MetricTile({ label, value, note }: MetricTileProps) {
  return (
    <View role="group" aria-label={label} style={styles.tile}>
      <NativeText style={styles.label}>{label}</NativeText>
      <NativeText style={styles.value}>{value}</NativeText>
      {note ? (
        <Content textStyle={styles.note} iconSize={styles.icon.width}>
          {note}
        </Content>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  tile: {
    gap: theme.space["50"],
    minWidth: 0,
    padding: theme.space["200"],
    backgroundColor: theme.color.surface.raised,
    borderWidth: theme["border-width"].hairline,
    borderColor: theme.color.border.hairline,
    borderRadius: theme.radius.control,
  },
  label: { ...fontStyle(theme, "caption"), color: theme.color.text.secondary },
  value: { ...fontStyle(theme, "metric"), color: theme.color.text.primary },
  note: { ...fontStyle(theme, "caption"), color: theme.color.text.secondary },
  icon: { width: theme.scale.component.icon.size.XS },
}));
