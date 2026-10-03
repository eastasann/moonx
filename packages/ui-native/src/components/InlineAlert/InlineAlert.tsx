import { INLINE_ALERT_VARIANTS, type InlineAlertVariant } from "@moonx/ui-tokens";
import { CircleAlert, Info, TriangleAlert } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";

export interface InlineAlertProps {
  variant?: InlineAlertVariant;
  /** Short title of the message. */
  heading: ReactNode;
  /** Body under the heading; when empty only the heading is drawn. */
  children?: ReactNode;
  /**
   * `alert` interrupts the reader and `status` waits for a pause; `note` is for a message that is
   * already on the screen when it loads. Defaults to `alert` for `negative` and `status` otherwise.
   */
  role?: "alert" | "status" | "note";
}

const icons = {
  informative: Info,
  notice: TriangleAlert,
  negative: CircleAlert,
  neutral: Info,
} as const;

const LIVE_REGION = { alert: "assertive", status: "polite", note: "none" } as const;

export function InlineAlert({
  variant = "informative",
  heading,
  children,
  role,
}: InlineAlertProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ variant });
  const Icon = icons[variant];
  const resolvedRole = role ?? (variant === "negative" ? "alert" : "status");
  return (
    <View
      role={resolvedRole}
      accessibilityLiveRegion={LIVE_REGION[resolvedRole]}
      style={styles.alert}
    >
      <View aria-hidden>
        <Icon
          size={theme.scale.component.icon.size.M}
          color={theme.color[variant].fg}
          strokeWidth={theme.icon["stroke-width"]}
        />
      </View>
      <View style={styles.body}>
        <Content textStyle={styles.heading} iconSize={styles.icon.width}>
          {heading}
        </Content>
        {children ? (
          <Content textStyle={styles.text} iconSize={styles.icon.width}>
            {children}
          </Content>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.space["200"],
    padding: theme.space["300"],
    borderWidth: theme["border-width"].strong,
    borderRadius: theme.radius.control,
    variants: {
      variant: Object.fromEntries(
        INLINE_ALERT_VARIANTS.map((v) => [
          v,
          { backgroundColor: theme.color[v].bg, borderColor: theme.color[v].strong },
        ]),
      ) as Record<InlineAlertVariant, { backgroundColor: string; borderColor: string }>,
    },
  },
  body: { flex: 1, gap: theme.space["50"] },
  heading: { ...fontStyle(theme, "label"), color: theme.color.text.primary },
  text: { ...fontStyle(theme, "body-sm"), color: theme.color.text.primary },
  icon: { width: theme.scale.component.icon.size.S },
}));
