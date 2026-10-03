import { Children, createContext, type ReactNode, useContext } from "react";
import { Text as NativeText, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { fontStyle } from "../../internal/typography";

interface Position {
  index: number;
  ordered: boolean;
}

const PositionContext = createContext<Position>({ index: 0, ordered: false });

export interface RowListProps {
  /** Names the list for assistive technology. */
  "aria-label": string;
  /** Numbers the rows (Next steps). */
  ordered?: boolean;
  /** `RowListItem`s. */
  children: ReactNode;
}

/** A static list of rows separated by hairlines. Rows that open something hold a `Link`. */
export function RowList({ ordered = false, children, "aria-label": ariaLabel }: RowListProps) {
  return (
    <View role="list" aria-label={ariaLabel}>
      {Children.toArray(children).map((child, index) => (
        // Children.toArray gives every child a stable key.
        <PositionContext.Provider key={keyOf(child, index)} value={{ index, ordered }}>
          {child}
        </PositionContext.Provider>
      ))}
    </View>
  );
}

function keyOf(child: ReactNode, index: number): string {
  return typeof child === "object" && child !== null && "key" in child && child.key !== null
    ? String(child.key)
    : String(index);
}

export interface RowListItemProps {
  children: ReactNode;
}

export function RowListItem({ children }: RowListItemProps) {
  const { index, ordered } = useContext(PositionContext);
  return (
    <View role="listitem" style={styles.item(index === 0)}>
      {ordered ? <NativeText style={styles.marker}>{`${index + 1}.`}</NativeText> : null}
      <View style={styles.content}>
        <Content textStyle={styles.text} iconSize={styles.icon.width}>
          {children}
        </Content>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  item: (first: boolean) => ({
    flexDirection: "row",
    gap: theme.space["100"],
    paddingVertical: theme.space["100"],
    borderTopWidth: first ? 0 : theme["border-width"].hairline,
    borderTopColor: theme.color.border.hairline,
  }),
  marker: { ...fontStyle(theme, "body"), color: theme.color.text.secondary },
  content: { flex: 1, minWidth: 0 },
  text: { ...fontStyle(theme, "body"), color: theme.color.text.primary },
  icon: { width: theme.scale.component.icon.size.S },
}));
