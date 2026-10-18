import { createElement, type ReactNode } from "react";
import * as styles from "./layout.css";
import type { LayoutDomProps } from "./types";

export interface ContainerProps extends LayoutDomProps {
  /**
   * `content`: up to `layout.content-max` (the body of a screen). `reading`: up to
   * `layout.reading-column-max` (question forms, focused flows, settings).
   * @default "content"
   */
  width?: "content" | "reading";
  /** Pads the sides by the page gutter of the breakpoint. @default true */
  hasGutters?: boolean;
  children?: ReactNode;
}

/** A centred column of limited width. */
export function Container({
  elementType = "div",
  width = "content",
  hasGutters = true,
  children,
  ...dom
}: ContainerProps) {
  return createElement(
    elementType,
    { ...dom, className: styles.container({ width, gutters: hasGutters }) },
    children,
  );
}
