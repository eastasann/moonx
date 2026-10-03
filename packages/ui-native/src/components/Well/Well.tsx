import type { ReactNode } from "react";
import { Text as NativeText, ScrollView, useWindowDimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";

interface WellBaseProps {
  children: ReactNode;
}

type Unnamed = { "aria-label"?: undefined; "aria-labelledby"?: undefined };
type Named =
  | { "aria-label": string; "aria-labelledby"?: undefined }
  | { "aria-label"?: undefined; "aria-labelledby": string };

/**
 * A name is optional; when given, the well becomes a labelled group. `preformatted` shows `children`
 * (a string) as it is written, in the monospace face, and scrolls it inside the well: the name is
 * required then, because a scrolling region needs one.
 */
export type WellProps = WellBaseProps &
  ((Unnamed & { preformatted?: false }) | (Named & { preformatted?: boolean }));

export function Well({ children, preformatted: isPreformatted, ...aria }: WellProps) {
  const { height } = useWindowDimensions();
  const named = aria["aria-label"] !== undefined || aria["aria-labelledby"] !== undefined;
  return (
    <View {...aria} role={named ? "group" : undefined} style={styles.well}>
      {isPreformatted ? (
        <ScrollView nestedScrollEnabled style={styles.scroll(height)}>
          <NativeText selectable style={styles.preformatted}>
            {children}
          </NativeText>
        </ScrollView>
      ) : (
        <Content textStyle={styles.text} iconSize={styles.icon.width}>
          {children}
        </Content>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  well: {
    padding: theme.space["300"],
    backgroundColor: theme.color.surface.sunken,
    borderWidth: theme["border-width"].hairline,
    borderColor: theme.color.border.hairline,
    borderRadius: theme.radius.control,
  },
  text: { ...fontStyle(theme, "body"), color: theme.color.text.primary },
  icon: { width: theme.scale.component.icon.size.S },
  // Long text stays inside the well and scrolls there, so a large export does not push the
  // screen's actions out of reach.
  scroll: (windowHeight: number) => ({
    maxHeight: windowHeight * theme.layout["sheet-max-height-ratio"],
  }),
  preformatted: { ...fontStyle(theme, "id"), color: theme.color.text.primary },
}));
