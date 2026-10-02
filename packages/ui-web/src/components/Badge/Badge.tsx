import type { BadgeVariant, ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { badge } from "./Badge.css";

export interface BadgeProps {
  /** `neutral` unless the color means something: a decision, a process, an overdue state. */
  variant?: BadgeVariant;
  size?: ComponentSize;
  children: ReactNode;
}

/** A short status label. Use the `drop` variant for a Drop decision, never `negative`. */
export function Badge({ variant = "neutral", size = "M", children }: BadgeProps) {
  return <span className={badge({ variant, size })}>{children}</span>;
}
