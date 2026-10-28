import { createElement, type ReactNode } from "react";
import * as styles from "./layout.css";
import { sprinkles } from "./sprinkles.css";
import {
  type FlexAlign,
  type FlexJustify,
  type GapProps,
  type LayoutDomProps,
  mapResponsive,
  type Responsive,
} from "./types";

export interface FlexProps extends LayoutDomProps, GapProps {
  /** @default "row" */
  direction?: Responsive<"row" | "column" | "row-reverse" | "column-reverse">;
  wrap?: Responsive<boolean>;
  alignItems?: Responsive<FlexAlign>;
  justifyContent?: Responsive<FlexJustify>;
  /**
   * `false` keeps it from getting narrower than its content in a row, which a Flex
   * otherwise may (so that text in it wraps): a group of buttons beside a title that
   * wraps (a detail's 💬, 🕘 and ⋯).
   * @default true
   */
  shrink?: boolean;
  /**
   * Takes the room its parent Flex or Stack leaves: a comment's column beside its Avatar
   * fills the panel's width, so the ⋯ at the end of its first row sits at the edge.
   * @default false
   */
  grow?: boolean;
  children?: ReactNode;
}

/** Lays children out in a row or a column; screens set spacing by token name only. */
export function Flex({
  elementType = "div",
  direction = "row",
  wrap,
  gap,
  rowGap,
  columnGap,
  alignItems,
  justifyContent,
  shrink = true,
  grow = false,
  children,
  ...dom
}: FlexProps) {
  const className = `${styles.flex}${shrink ? "" : ` ${styles.noShrink}`}${grow ? ` ${styles.grow}` : ""} ${sprinkles(
    {
      flexDirection: direction,
      flexWrap: mapResponsive(wrap, (value) => (value ? "wrap" : "nowrap")),
      gap,
      rowGap,
      columnGap,
      alignItems,
      justifyContent,
    },
  )}`;
  return createElement(elementType, { ...dom, className }, children);
}

export interface StackProps
  extends LayoutDomProps,
    Pick<GapProps, "gap">,
    Pick<FlexProps, "alignItems" | "grow" | "children"> {}

/** A column of children with one gap between them: Flex with direction column. */
export function Stack(props: StackProps) {
  return <Flex {...props} direction="column" />;
}
