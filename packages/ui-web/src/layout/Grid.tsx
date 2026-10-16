import { createElement, type ReactNode } from "react";
import * as styles from "./layout.css";
import { sprinkles } from "./sprinkles.css";
import type {
  FlexAlign,
  FlexJustify,
  GapProps,
  LayoutDomProps,
  Responsive,
} from "./types";

export type GridColumns = 1 | 2 | 3 | 4 | 5 | 6 | 12;

export interface GridProps extends LayoutDomProps, GapProps {
  /** Equal columns. @default 1 */
  columns?: Responsive<GridColumns>;
  alignItems?: Responsive<FlexAlign>;
  justifyItems?: Responsive<Exclude<FlexAlign, "baseline">>;
  justifyContent?: Responsive<FlexJustify>;
  children?: ReactNode;
}

/** Places children in equal columns, which may change at the 06 breakpoints. */
export function Grid({
  elementType = "div",
  columns = 1,
  gap,
  rowGap,
  columnGap,
  alignItems,
  justifyItems,
  justifyContent,
  children,
  ...dom
}: GridProps) {
  const className = `${styles.grid} ${sprinkles({
    gridTemplateColumns: columns,
    gap,
    rowGap,
    columnGap,
    alignItems,
    justifyItems,
    justifyContent,
  })}`;
  return createElement(elementType, { ...dom, className }, children);
}
