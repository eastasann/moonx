import type { Space } from "@moonx/ui-tokens";
import type { AriaRole } from "react";

/**
 * A value for every width, or one per 06 breakpoint, mobile first: `{ mobile: "column",
 * desktop: "row" }` is a column until `semantic.breakpoint.desktop`.
 */
export type Responsive<T> = T | { mobile?: T; tablet?: T; desktop?: T };

export type FlexAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type FlexJustify =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

/** The elements a layout component may render, for landmarks and lists. */
export type LayoutElement =
  | "div"
  | "section"
  | "article"
  | "aside"
  | "header"
  | "footer"
  | "nav"
  | "main"
  | "ul"
  | "ol"
  | "li"
  | "span";

/** What a layout component passes to its element: no class names, no style (ADR-025). */
export interface LayoutDomProps {
  elementType?: LayoutElement;
  id?: string;
  role?: AriaRole;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/** Spacing between children, by token name only (ADR-025). */
export interface GapProps {
  gap?: Responsive<Space>;
  rowGap?: Responsive<Space>;
  columnGap?: Responsive<Space>;
}

/** Applies `map` to a responsive value, keeping its breakpoints. */
export function mapResponsive<T, U>(
  value: Responsive<T> | undefined,
  map: (value: T) => U,
): Responsive<U> | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const byBreakpoint = value as { mobile?: T; tablet?: T; desktop?: T };
    return Object.fromEntries(
      Object.entries(byBreakpoint).map(([key, entry]) => [
        key,
        map(entry as T),
      ]),
    ) as Responsive<U>;
  }
  return map(value as T);
}
