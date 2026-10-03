import type { ComponentSize, StatusLightVariant } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { strongColors } from "../StatusLight/colors";

export interface MeterSegment {
  /** Name of the part, e.g. "Fact". Shown in the legend and read by assistive technology. */
  label: string;
  /** Size of the part; negative and non-finite values count as 0. */
  value: number;
  variant: StatusLightVariant;
  /** The part's value as text, e.g. "6 answers". Formatted by the screen with the i18n helpers. */
  valueLabel?: string;
}

export interface MeterProps {
  /** What the band measures, e.g. "Answers by F/A/U". Names the whole group. */
  label: string;
  /**
   * Summary of the whole, e.g. "10 answers". Shown beside the label and read after it. Only text
   * (a string or number) is read; any other node is drawn but not spoken.
   */
  description?: ReactNode;
  /** The parts, in drawing order. */
  segments: readonly MeterSegment[];
  /** The value the full band stands for. Defaults to the sum of the segments. */
  maxValue?: number;
  /** Shows the legend. When false the parts are still read by assistive technology. */
  showLegend?: boolean;
  size?: ComponentSize;
  testID?: string;
}

const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * A stacked meter: one band split into the parts of a whole. It is one accessibility element
 * that reads the label, the description and every part (label and value text) in order, because
 * a single meter value cannot describe several parts. The legend is drawn for sighted users and
 * hidden from assistive technology so nothing is read twice.
 */
export function Meter({
  label,
  description,
  segments,
  maxValue,
  showLegend = true,
  size = "M",
  testID,
}: MeterProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ size });
  const colors = strongColors(theme);
  const sum = segments.reduce((total, s) => total + safe(s.value), 0);
  const total = Math.max(sum, safe(maxValue ?? 0));
  const spoken = [
    label,
    typeof description === "string" || typeof description === "number" ? String(description) : "",
    ...segments.map((s) => [s.label, s.valueLabel].filter(Boolean).join(" ")),
  ]
    .filter((part) => part !== "")
    .join(", ");

  return (
    <View accessible role="group" aria-label={spoken} testID={testID} style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <View style={styles.band}>
        {segments.map((s, index) =>
          safe(s.value) > 0 ? (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: segments have no id and label plus variant can repeat; the list is positional
              key={`${index}-${s.label}-${s.variant}`}
              style={styles.segment(colors[s.variant], (safe(s.value) / total) * 100)}
            />
          ) : null,
        )}
      </View>
      {showLegend ? (
        <View style={styles.legend}>
          {segments.map((s, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments have no id and label plus variant can repeat; the list is positional
            <View key={`${index}-${s.label}-${s.variant}`} style={styles.legendItem}>
              <View style={styles.swatch(colors[s.variant])} />
              <Text style={styles.legendText}>
                {s.label}
                {s.valueLabel ? <Text style={styles.legendValue}> {s.valueLabel}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { alignSelf: "stretch", gap: theme.space["75"] },
  header: { flexDirection: "row", justifyContent: "space-between", gap: theme.space["200"] },
  label: { ...fontStyle(theme, "label"), color: theme.color.text.primary },
  description: { ...fontStyle(theme, "number"), color: theme.color.text.secondary },
  band: {
    flexDirection: "row",
    gap: theme.space["25"],
    overflow: "hidden",
    alignSelf: "stretch",
    backgroundColor: theme.color.control.track,
    borderRadius: theme.radius.pill,
    variants: {
      size: sizeVariants((s) => ({ height: theme.scale.component.meter.thickness[s] })),
    },
  },
  segment: (color: string, percent: number) => ({
    flexShrink: 1,
    minWidth: 0,
    height: "100%",
    width: `${percent}%`,
    backgroundColor: color,
  }),
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: theme.space["100"],
    columnGap: theme.space["300"],
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: theme.space["100"] },
  legendText: { ...fontStyle(theme, "caption"), color: theme.color.text.primary },
  legendValue: {
    fontVariant: fontStyle(theme, "number").fontVariant,
    color: theme.color.text.secondary,
  },
  swatch: (color: string) => ({
    flexShrink: 0,
    width: theme.scale.component["status-light"]["dot-size"].S,
    height: theme.scale.component["status-light"]["dot-size"].S,
    borderRadius: theme.radius.pill,
    backgroundColor: color,
  }),
}));
