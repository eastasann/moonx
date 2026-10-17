import type { TextTone, TextVariant } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { Text as AriaText } from "react-aria-components";
import { SkeletonText } from "./Skeleton";
import * as styles from "./typography.css";

export interface TextProps {
  /**
   * `body-long` keeps typed line breaks and opens the leading for long answers; `lead` is
   * the landing's opening sentence; `number` is the monospaced face for amounts and counts
   * (design-spec 4.4).
   * @default "body"
   */
  variant?: TextVariant;
  /**
   * `notice` is the amber of attention ("Not classified yet", 6.2).
   * @default "secondary" for `lead` (06 semantic.typography.lead), "primary" otherwise
   */
  tone?: TextTone;
  /** @default "span" */
  elementType?: "span" | "p" | "div";
  id?: string;
  /** Lets a surrounding component take the text (`description` of a field). */
  slot?: string;
  children: ReactNode;
}

/** Body text in one of the 06 typography styles; inside a loading `Skeleton`, its bar. */
export function Text({
  variant = "body",
  tone = variant === "lead" ? "secondary" : "primary",
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
      <SkeletonText>{children}</SkeletonText>
    </AriaText>
  );
}
