import {
  COMPONENT_SIZES,
  type ComponentSize,
  STATUS_LIGHT_VARIANTS,
  type StatusLightVariant,
} from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { strongColors } from "./colors";

export interface StatusLightProps {
  /** Status family, F/A/U state or check item state. Color alone never carries the meaning. */
  variant: StatusLightVariant;
  size?: ComponentSize;
  /** The label; required because the dot is hidden from assistive technology. */
  children: ReactNode;
}

export function StatusLight({ variant, size = "M", children }: StatusLightProps) {
  styles.useVariants({ variant, size });
  return (
    <View style={styles.row}>
      <View aria-hidden style={styles.dot} />
      <Content textStyle={styles.label} iconSize={styles.icon.width}>
        {children}
      </Content>
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = strongColors(theme);
  const fontSizes = { S: "75", M: "100", L: "200", XL: "300" } as const;
  return {
    row: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: theme.space["100"],
    },
    dot: {
      flexShrink: 0,
      borderRadius: theme.radius.pill,
      variants: {
        variant: Object.fromEntries(
          STATUS_LIGHT_VARIANTS.map((v) => [v, { backgroundColor: colors[v] }]),
        ) as Record<StatusLightVariant, { backgroundColor: string }>,
        size: sizeVariants((s) => ({
          width: theme.scale.component["status-light"]["dot-size"][s],
          height: theme.scale.component["status-light"]["dot-size"][s],
        })),
      },
    },
    label: {
      ...fontStyle(theme, "label"),
      color: theme.color.text.primary,
      variants: {
        size: Object.fromEntries(
          COMPONENT_SIZES.map((s) => [s, { fontSize: theme.scale["font-size"][fontSizes[s]] }]),
        ) as Record<ComponentSize, { fontSize: number }>,
      },
    },
    icon: { width: theme.scale.component.icon.size.XS },
  };
});
