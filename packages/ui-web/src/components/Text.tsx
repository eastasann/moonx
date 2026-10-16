import type { TextTone, TextVariant } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { Text as AriaText } from "react-aria-components";
import * as styles from "./typography.css";

export interface TextProps {
  /**
   * `body-long` keeps typed line breaks and opens the leading for long answers; `number`
   * is the monospaced face for amounts and counts (design-spec 4.4).
   * @default "body"
   */
  variant?: TextVariant;
  /** @default "primary" */
  tone?: TextTone;
  /** @default "span" */
  elementType?: "span" | "p" | "div";
  id?: string;
  /** Lets a surrounding component take the text (`description` of a field). */
  slot?: string;
  children: ReactNode;
}

/** Body text in one of the 06 typography styles. */
export function Text({
  variant = "body",
  tone = "primary",
  elementType = "span",
  children,
  ...props
}: TextProps) {
  return (
    <AriaText
      {...props}
      elementType={elementType}
      className={styles.text({ variant, tone })}
    >
      {children}
    </AriaText>
  );
}
