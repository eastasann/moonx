import {
  BADGE_VARIANTS,
  type BadgeVariant,
  COMPONENT_SIZES,
  type ComponentSize,
  DECISION_VARIANTS,
  type STATUS_VARIANTS,
} from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";

export interface BadgeProps {
  /** `neutral` unless the color means something: a decision, a process, an overdue state. */
  variant?: BadgeVariant;
  size?: ComponentSize;
  children: ReactNode;
}

/** A short status label. Use the `drop` variant for a Drop decision, never `negative`. */
export function Badge({ variant = "neutral", size = "M", children }: BadgeProps) {
  styles.useVariants({ variant, size });
  return (
    <View style={styles.badge}>
      <Content textStyle={styles.label} iconSize={styles.icon.width}>
        {children}
      </Content>
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const palette = (v: BadgeVariant) =>
    (DECISION_VARIANTS as readonly string[]).includes(v)
      ? theme.color.decision[v as (typeof DECISION_VARIANTS)[number]]
      : theme.color[v as (typeof STATUS_VARIANTS)[number]];
  const spacing = {
    S: { vertical: "25", horizontal: "75", font: "50" },
    M: { vertical: "50", horizontal: "100", font: "75" },
    L: { vertical: "75", horizontal: "200", font: "100" },
    XL: { vertical: "85", horizontal: "300", font: "200" },
  } as const;
  return {
    badge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      borderRadius: theme.radius.chip,
      variants: {
        variant: Object.fromEntries(
          BADGE_VARIANTS.map((v) => [v, { backgroundColor: palette(v).bg }]),
        ) as Record<BadgeVariant, { backgroundColor: string }>,
        size: Object.fromEntries(
          COMPONENT_SIZES.map((s) => [
            s,
            {
              paddingVertical: theme.space[spacing[s].vertical],
              paddingHorizontal: theme.space[spacing[s].horizontal],
            },
          ]),
        ) as Record<ComponentSize, { paddingVertical: number; paddingHorizontal: number }>,
      },
    },
    label: {
      ...fontStyle(theme, "label"),
      variants: {
        variant: Object.fromEntries(
          BADGE_VARIANTS.map((v) => [v, { color: palette(v).fg }]),
        ) as Record<BadgeVariant, { color: string }>,
        size: Object.fromEntries(
          COMPONENT_SIZES.map((s) => [s, { fontSize: theme.scale["font-size"][spacing[s].font] }]),
        ) as Record<ComponentSize, { fontSize: number }>,
      },
    },
    icon: { width: theme.scale.component.icon.size.XS },
  };
});
