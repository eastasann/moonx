import type { ButtonVariant, Size } from "@moonx/ui-tokens";
import { type ReactNode, useContext } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  Group,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import { BottomBarContext, SizeContext, useSize } from "../internal/size";
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
  /** @default "M"; "L" in a spacious pattern, dialog or `Form` (06 semantic.density) */
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
  const inBottomBar = useContext(BottomBarContext);
  const resolved = useSize(size ?? (inBottomBar !== false ? "XL" : undefined));
  const fills = inBottomBar === "all" || (inBottomBar === "main" && !isQuiet);
  return (
    <AriaButton
      {...props}
      className={styles.button({ variant, isQuiet, size: resolved, fills })}
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
  /**
   * The size of the Buttons that do not set their own.
   * @default the density around (L in a spacious pattern, dialog or `Form`), otherwise "M"
   */
  size?: Size;
  "aria-label"?: string;
  children: ReactNode;
}

/** Buttons side by side, wrapping onto a new line when the row is too narrow. */
export function ButtonGroup({
  align = "start",
  orientation = "horizontal",
  size,
  children,
  ...props
}: ButtonGroupProps) {
  return (
    <Group {...props} className={styles.group({ align, orientation })}>
      {size === undefined ? (
        children
      ) : (
        <SizeContext.Provider value={size}>{children}</SizeContext.Provider>
      )}
    </Group>
  );
}
