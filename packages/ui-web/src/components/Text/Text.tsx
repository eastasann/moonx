import type { ReactNode } from "react";
import { text } from "./Text.css";

export interface TextProps {
  /** `body-long` has the wider line spacing for answers and other long reading. */
  variant?: "body" | "body-long" | "body-sm" | "caption" | "label";
  tone?: "primary" | "secondary" | "negative";
  as?: "p" | "span" | "div";
  id?: string;
  children: ReactNode;
}

/** Running text in the body typeface. */
export function Text({ variant, tone, as: Tag = "p", id, children }: TextProps) {
  return (
    <Tag id={id} className={text({ variant, tone })}>
      {children}
    </Tag>
  );
}
