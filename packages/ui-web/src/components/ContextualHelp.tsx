import { i18n } from "@moonx/i18n";
import type { ContextualHelpSize } from "@moonx/ui-tokens";
import { CircleHelp, Info } from "lucide-react";
import type { ReactNode } from "react";
import {
  type PopoverProps as AriaPopoverProps,
  Dialog,
} from "react-aria-components";
import { FixedLocale } from "../internal/FixedLocale";
import { ResponsivePopover } from "../internal/ResponsivePopover";
import { ActionButtonBase } from "./ActionButton";
import * as styles from "./ContextualHelp.css";
import { DialogTrigger } from "./Dialog";
import { Heading } from "./Heading";
import { Text } from "./Text";

export interface ContextualHelpProps
  extends Pick<AriaPopoverProps, "placement"> {
  /** `help` (?) explains how; `info` (i) adds background. @default "help" */
  variant?: "help" | "info";
  /** The button's size. @default "XS" */
  size?: ContextualHelpSize;
  /** The popover's heading. */
  title: ReactNode;
  /** The help itself; links may sit in it (design-spec 4.5 Link, secondary). */
  children: ReactNode;
  /**
   * Text shown beside the icon, such as the question form's "Hint" (design-spec 6.2).
   * Without it the button is the icon alone, named by `aria-label`.
   */
  label?: ReactNode;
  /** @default the catalog's "Help" or "Information" */
  "aria-label"?: string;
}

/**
 * A quiet button that opens help in a popover, or in a tray on a phone (the question's
 * hint, design-spec 4.5). Closing it returns focus to the button.
 */
export function ContextualHelp({
  variant = "help",
  size = "XS",
  title,
  children,
  label,
  placement,
  "aria-label": ariaLabel,
}: ContextualHelpProps) {
  return (
    <DialogTrigger>
      <ActionButtonBase
        isQuiet
        size={size}
        aria-label={
          label === undefined
            ? (ariaLabel ?? i18n.t(`components:contextualHelp.${variant}`))
            : ariaLabel
        }
      >
        {variant === "help" ? <CircleHelp /> : <Info />}
        {label}
      </ActionButtonBase>
      <FixedLocale>
        <ResponsivePopover placement={placement}>
          <Dialog className={styles.content}>
            {/* Spectrum 2's help heading is heading-xs, the size of heading-4. */}
            <Heading level={4} slot="title">
              {title}
            </Heading>
            <Text variant="body-sm" elementType="div">
              {children}
            </Text>
          </Dialog>
        </ResponsivePopover>
      </FixedLocale>
    </DialogTrigger>
  );
}
