import type { ButtonVariant, Size } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  Group,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import { useSize } from "../internal/size";
import * as styles from "./Button.css";
import { PendingCircle } from "./ProgressCircle";

export interface ButtonProps
  extends Pick<
    AriaButtonProps,
    | "onPress"
    | "isDisabled"
    | "isPending"
    | "type"
    | "form"
    | "autoFocus"
    | "id"
    | "aria-label"
    | "aria-describedby"
    | "aria-expanded"
    | "aria-controls"
    | "aria-haspopup"
  > {
  /**
   * `primary`: the one main action of a screen. `secondary`: other actions (bordered).
   * `negative`: only to confirm a deletion (design-spec 4.5).
   * @default "primary"
   */
  variant?: ButtonVariant;
  /** Supporting actions: no fill and no border. */
  isQuiet?: boolean;
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** Text, optionally with a Lucide icon before it. */
  children: ReactNode;
}

/**
 * A button. While `isPending` it shows a ProgressCircle over its label and ignores
 * presses (design-spec 4.5).
 */
export function Button({
  variant = "primary",
  isQuiet = false,
  size,
  children,
  ...props
}: ButtonProps) {
  const resolved = useSize(size);
  return (
    <AriaButton
      {...props}
      className={styles.button({ variant, isQuiet, size: resolved })}
    >
      {({ isPending }) => (
        <>
          <span className={styles.label}>
            <IconSlot size={resolved}>{children}</IconSlot>
          </span>
          {isPending && (
            <span className={styles.pending}>
              <PendingCircle />
            </span>
          )}
        </>
      )}
    </AriaButton>
  );
}

export interface ButtonGroupProps {
  /** @default "start" */
  align?: "start" | "center" | "end";
  /** `vertical` stacks the buttons at full width. @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  "aria-label"?: string;
  children: ReactNode;
}

/** Buttons side by side, wrapping onto a new line when the row is too narrow. */
export function ButtonGroup({
  align = "start",
  orientation = "horizontal",
  children,
  ...props
}: ButtonGroupProps) {
  return (
    <Group {...props} className={styles.group({ align, orientation })}>
      {children}
    </Group>
  );
}
