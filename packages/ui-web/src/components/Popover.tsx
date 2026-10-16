import type { PopoverSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import {
  type PopoverProps as AriaPopoverProps,
  Dialog,
} from "react-aria-components";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "../internal/overlay.css";
import { ResponsivePopover } from "../internal/ResponsivePopover";

export interface PopoverProps extends Pick<AriaPopoverProps, "placement"> {
  /**
   * The width (06 component.popover.width). Without it the popover fits its content. A
   * phone shows a tray, as wide as the window, instead (design-spec 4.5).
   */
  size?: PopoverSize;
  /** Names the popover's dialog when no heading inside does. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** The content, or a function that receives `close`. */
  children: ReactNode | ((options: { close: () => void }) => ReactNode);
}

/**
 * A panel anchored to its trigger on tablet and wider, a tray on a phone (design-spec
 * 4.5). Put it in a `DialogTrigger` after the button that opens it: focus moves in when it
 * opens and back to the button when it closes, and Escape or a press outside closes it.
 */
export function Popover({
  size,
  placement,
  children,
  ...dialogProps
}: PopoverProps) {
  return (
    <FixedLocale>
      <ResponsivePopover size={size} placement={placement}>
        <Dialog {...dialogProps} className={styles.popoverDialog}>
          {children}
        </Dialog>
      </ResponsivePopover>
    </FixedLocale>
  );
}
