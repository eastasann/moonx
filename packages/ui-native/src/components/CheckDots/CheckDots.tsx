import type { CheckVariant } from "@moonx/ui-tokens";
import { Text as NativeText, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";

const GLYPH: Record<CheckVariant, string> = { done: "●", partial: "◐", "not-started": "○" };

export interface CheckDotsItem {
  /** Name of the check, for the accessible description. */
  label: string;
  state: CheckVariant;
  /** Text of the state ("Done", "Partial", "Not started"), for the accessible description. */
  stateLabel: string;
}

export interface CheckDotsProps {
  /** One dot per item, in the given order. */
  items: CheckDotsItem[];
  size?: "S" | "M";
}

/**
 * The states of the six checks as a row of dots, ● done, ◐ partial, ○ not started (design-spec
 * 6.8). The shape carries the state, so color is never the only signal; assistive technology
 * reads one image named by every check and its state.
 */
export function CheckDots({ items, size = "M" }: CheckDotsProps) {
  styles.useVariants({ size });
  const description = items.map((item) => `${item.label}: ${item.stateLabel}`).join(", ");
  return (
    <View accessible role="img" aria-label={description} style={styles.dots}>
      {items.map((item) => (
        <NativeText key={item.label} aria-hidden style={styles.dot(item.state)}>
          {GLYPH[item.state]}
        </NativeText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  dots: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.space["50"],
  },
  dot: (state: CheckVariant) => ({
    ...fontStyle(theme, "label"),
    color: theme.color.check[state].strong,
    variants: {
      size: {
        S: { fontSize: theme.scale["font-size"]["75"] },
        M: { fontSize: theme.scale["font-size"]["100"] },
      },
    },
  }),
}));
