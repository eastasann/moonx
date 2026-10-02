import type { ReactNode } from "react";
import { heading } from "./Heading.css";

export type HeadingVariant = "display" | "heading-1" | "heading-2" | "heading-3" | "heading-4";

export interface HeadingProps {
  /** The heading's level in the page outline; also picks the look unless `variant` is given. */
  level: 1 | 2 | 3 | 4;
  /** The look. `display` is for the landing page title. */
  variant?: HeadingVariant;
  id?: string;
  children: ReactNode;
}

/** A page or section title in the display typeface. */
export function Heading({ level, variant, id, children }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className={heading({ variant: variant ?? `heading-${level}` })}>
      {children}
    </Tag>
  );
}
