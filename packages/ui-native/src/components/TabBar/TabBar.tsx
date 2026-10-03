import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { textOf } from "../../internal/FieldParts";
import { atLeastTarget } from "../../internal/sizes";
import { useRegisterTabBar } from "../../internal/tabBarPresence";
import { fontStyle } from "../../internal/typography";

export interface TabBarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Slot over the icon's corner, such as a Badge with the unread count. Read after the label. */
  badge?: ReactNode;
  /** Marks the tab of the screen being shown. */
  isCurrent?: boolean;
  /**
   * Required for every tab. The Web part's link items (`href`) navigate by themselves; on the
   * phone navigation is the screen's job (the Expo Router call goes here), so `href` is not
   * accepted.
   */
  onPress: () => void;
  /** For a tab that opens a tray (More): whether the tray is showing. The tab becomes a button. */
  isExpanded?: boolean;
  testID?: string;
}

export interface TabBarProps {
  /** Name of the navigation landmark. */
  "aria-label": string;
  /** Five tabs in order: Dashboard, Ideas, Self Analysis, Notifications, More. */
  items: readonly TabBarItem[];
}

/**
 * Bottom tab bar of the phone frame (design-spec 6.0.1). It sits in the screen's layout flow
 * under the content, as tall as `semantic.layout.tab-bar-height` plus the bottom safe-area
 * inset, so content is never covered. The Web part's "hidden from tablet width up" has no
 * counterpart: the phone frame always shows it.
 */
export function TabBar({ items, "aria-label": ariaLabel }: TabBarProps) {
  const insets = useSafeAreaInsets();
  useRegisterTabBar();
  return (
    <View
      role="tablist"
      aria-label={ariaLabel}
      style={[styles.root, { paddingBottom: insets.bottom }]}
    >
      {items.map((tab) => (
        <Tab key={tab.id} tab={tab} />
      ))}
    </View>
  );
}

function Tab({ tab }: { tab: TabBarItem }) {
  const { theme } = useUnistyles();
  const current = tab.isCurrent === true;
  styles.useVariants({ current });
  const Icon = tab.icon;
  const opensTray = tab.isExpanded !== undefined;
  const badgeText = tab.badge ? textOf(tab.badge) : "";
  return (
    <Pressable
      role={opensTray ? "button" : "tab"}
      aria-label={tab.label}
      aria-selected={opensTray ? undefined : current}
      aria-expanded={tab.isExpanded}
      accessibilityValue={badgeText === "" ? undefined : { text: badgeText }}
      testID={tab.testID}
      onPress={tab.onPress}
      style={({ pressed }) => styles.item(pressed)}
    >
      <View style={styles.iconWrap}>
        <Icon
          size={theme.scale.component.icon.size.M}
          color={styles.label.color}
          strokeWidth={theme.icon["stroke-width"]}
        />
        {tab.badge ? (
          <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.badge}>
            {tab.badge}
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.label}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const targetMin = theme.scale.component["target-min"];
  return {
    root: {
      flexDirection: "row",
      backgroundColor: theme.color.surface.raised,
      borderTopWidth: theme["border-width"].hairline,
      borderTopColor: theme.color.border.hairline,
    },
    item: (pressed: boolean) => ({
      flex: 1,
      minWidth: targetMin,
      minHeight: atLeastTarget(theme.layout["tab-bar-height"], targetMin),
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space["50"],
      paddingHorizontal: theme.space["50"],
      paddingVertical: theme.space["75"],
      borderTopWidth: theme["border-width"].divider.M,
      borderTopColor: "transparent",
      backgroundColor: pressed ? theme.color.surface.hover : "transparent",
      variants: {
        current: { true: { borderTopColor: theme.color.control["track-fill"] }, false: {} },
      },
    }),
    iconWrap: { alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: -theme.space["75"],
      left: "100%",
      marginLeft: -theme.space["100"],
    },
    label: {
      ...fontStyle(theme, "label-sm"),
      maxWidth: "100%",
      color: theme.color.text.secondary,
      variants: { current: { true: { color: theme.color.text.primary }, false: {} } },
    },
  };
});
