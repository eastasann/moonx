import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Heading } from "../Heading";

export interface AppFrameProps {
  /** The `TabBar`. It sits under the body in the layout flow. */
  tabBar: ReactNode;
  /** The back control (← Back) shown before `title`. */
  backLink?: ReactNode;
  /** Name of the current screen. */
  title?: ReactNode;
  /** Save state, at the end of the header. */
  status?: ReactNode;
  /** Header entries: the Comments and History panel buttons. */
  actions?: ReactNode;
  /**
   * The `Panel` (comments or history). On the phone it opens in a `Tray`, which is portaled by
   * the bottom sheet, so the slot's position does not matter.
   */
  panel?: ReactNode;
  /** A notice above the header, such as the offline message. */
  banner?: ReactNode;
  children: ReactNode;
}

/**
 * The phone frame of every signed-in screen (design-spec 6.0.1): the header with the back
 * control, the screen name, the save state and the panel entries, then the body, then the
 * `TabBar`. The banner and the header sit below the top safe-area inset; the `TabBar` handles the
 * bottom one. Fill the screen with it (it is `flex: 1`).
 *
 * Web props with no phone meaning: `skipLabel` and `isEmbedded` (the skip link and the `main`
 * landmark exist only on the Web; the body is exposed as `main` here), `sideNav` and
 * `breadcrumbs` (the desktop and tablet navigation; the phone uses `tabBar`, `backLink` and
 * `title`).
 */
export function AppFrame({
  tabBar,
  backLink,
  title,
  status,
  actions,
  banner,
  panel,
  children,
}: AppFrameProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top }]}>
        {banner}
        <View style={styles.header}>
          <View style={styles.lead}>
            {backLink}
            {typeof title === "string" || typeof title === "number" ? (
              <View style={styles.title}>
                <Heading level={1} variant="heading-4">
                  {title}
                </Heading>
              </View>
            ) : (
              title
            )}
          </View>
          <View style={styles.tools}>
            {status}
            {actions}
          </View>
        </View>
      </View>
      <View role="main" style={styles.main}>
        {children}
      </View>
      {tabBar}
      {panel}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.color.surface.canvas },
  top: {
    backgroundColor: theme.color.surface.raised,
    borderBottomWidth: theme["border-width"].hairline,
    borderBottomColor: theme.color.border.hairline,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["200"],
    minHeight: theme.layout["header-height"],
    paddingHorizontal: theme.layout["page-gutter-mobile"],
  },
  lead: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["200"],
  },
  title: { flexShrink: 1, minWidth: 0 },
  tools: { flexDirection: "row", alignItems: "center", gap: theme.space["100"] },
  main: { flex: 1, minWidth: 0 },
}));
