import { SPACE_STEPS, type SpaceName, spaceStep } from "@moonx/ui-tokens";
import { Children, isValidElement, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const step = (name: SpaceName | undefined) => (name ? spaceStep(name) : undefined);

interface LayoutCommonProps {
  /** Test hook. The Web part has none; React Native has no DOM to query. */
  testID?: string;
}

export interface FlexProps extends LayoutCommonProps {
  direction?: "row" | "column";
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  gap?: SpaceName;
  padding?: SpaceName;
  paddingX?: SpaceName;
  paddingY?: SpaceName;
  grow?: boolean;
  children?: ReactNode;
}

/**
 * Row or column of children. Spacing takes token names only, e.g. `gap="space-300"`. Unlike the
 * Web part it has no `as`: there are no tags.
 */
export function Flex({
  direction = "row",
  align = "stretch",
  justify = "start",
  wrap = false,
  gap,
  padding,
  paddingX,
  paddingY,
  grow,
  children,
  testID,
}: FlexProps) {
  styles.useVariants({
    direction,
    align,
    justify,
    wrap,
    gap: step(gap),
    padding: step(padding),
    paddingX: step(paddingX),
    paddingY: step(paddingY),
    grow: grow ?? false,
  });
  return (
    <View testID={testID} style={styles.flex}>
      {children}
    </View>
  );
}

export type StackProps = Omit<FlexProps, "direction">;

/** Vertical `Flex`. */
export function Stack(props: StackProps) {
  return <Flex {...props} direction="column" />;
}

export interface GridProps extends LayoutCommonProps {
  columns?: 1 | 2 | 3 | 4;
  align?: "start" | "center" | "stretch";
  gap?: SpaceName;
  padding?: SpaceName;
  children?: ReactNode;
}

/**
 * Equal-width columns. Spacing takes token names only. React Native has no CSS grid, so the
 * children are laid out in rows of `columns` cells; the last row is padded with empty cells to
 * keep every column the same width.
 */
export function Grid({
  columns = 1,
  align = "stretch",
  gap,
  padding,
  children,
  testID,
}: GridProps) {
  styles.useVariants({ gap: step(gap), padding: step(padding), gridAlign: align });
  // `toArray` gives every element a stable key; the position only names the padding cells.
  const cells = Children.toArray(children).map((child, position) => ({
    key: isValidElement(child) && child.key !== null ? child.key : `cell-${position}`,
    child,
  }));
  const rows: { key: string; cells: typeof cells }[] = [];
  for (let i = 0; i < cells.length; i += columns) {
    const row = cells.slice(i, i + columns);
    rows.push({ key: row.map((cell) => cell.key).join("|"), cells: row });
  }
  return (
    <View testID={testID} style={styles.grid}>
      {rows.map((row) => (
        <View key={row.key} style={styles.gridRow}>
          {Array.from({ length: columns }, (_, column) => {
            const cell = row.cells[column];
            return (
              <View key={cell?.key ?? `empty-${row.key}-${column}`} style={styles.cell}>
                {cell?.child}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export interface ContainerProps extends LayoutCommonProps {
  /** `reading` is the single reading column, `content` the widest page content. */
  width?: "reading" | "content";
  children?: ReactNode;
}

/** Centers its children and caps the width at the reading column or the page content width. */
export function Container({ width = "content", children, testID }: ContainerProps) {
  styles.useVariants({ containerWidth: width });
  return (
    <View testID={testID} style={styles.container}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const bySpace = (property: "gap" | "padding" | "paddingHorizontal" | "paddingVertical") =>
    Object.fromEntries(SPACE_STEPS.map((s) => [s, { [property]: theme.space[s] }]));
  return {
    flex: {
      flexDirection: "row",
      minWidth: 0,
      variants: {
        direction: { row: { flexDirection: "row" }, column: { flexDirection: "column" } },
        align: {
          start: { alignItems: "flex-start" },
          center: { alignItems: "center" },
          end: { alignItems: "flex-end" },
          stretch: { alignItems: "stretch" },
          baseline: { alignItems: "baseline" },
        },
        justify: {
          start: { justifyContent: "flex-start" },
          center: { justifyContent: "center" },
          end: { justifyContent: "flex-end" },
          between: { justifyContent: "space-between" },
        },
        wrap: { true: { flexWrap: "wrap" }, false: { flexWrap: "nowrap" } },
        gap: bySpace("gap"),
        padding: bySpace("padding"),
        paddingX: bySpace("paddingHorizontal"),
        paddingY: bySpace("paddingVertical"),
        grow: { true: { flexGrow: 1 }, false: {} },
      },
    },
    grid: {
      minWidth: 0,
      variants: { gap: bySpace("gap"), padding: bySpace("padding") },
    },
    gridRow: {
      flexDirection: "row",
      variants: {
        gap: bySpace("gap"),
        gridAlign: {
          start: { alignItems: "flex-start" },
          center: { alignItems: "center" },
          stretch: { alignItems: "stretch" },
        },
      },
    },
    // flexBasis 0 plus minWidth 0 makes the cells equal however wide their content is.
    cell: { flex: 1, minWidth: 0 },
    container: {
      width: "100%",
      alignSelf: "center",
      variants: {
        containerWidth: {
          reading: { maxWidth: theme.layout["reading-column-max"] },
          content: { maxWidth: theme.layout["content-max"] },
        },
      },
    },
  };
});
