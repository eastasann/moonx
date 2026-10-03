import type { ReactElement, ReactNode } from "react";
import { Tray } from "../Tray";

/** The placements React Aria's `Popover` accepts; a tray has no anchor, so none changes anything. */
export type PopoverPlacement =
  | "bottom"
  | "bottom left"
  | "bottom right"
  | "bottom start"
  | "bottom end"
  | "top"
  | "top left"
  | "top right"
  | "top start"
  | "top end"
  | "left"
  | "left top"
  | "left bottom"
  | "start"
  | "start top"
  | "start bottom"
  | "right"
  | "right top"
  | "right bottom"
  | "end"
  | "end top"
  | "end bottom";

export interface ResponsivePopoverProps {
  /**
   * The element that opens the overlay. It must take `onPress`, like `Button`. On the Web the
   * trigger is a parent component that shares its state with the overlay; React Native has no
   * such context, so the overlay owns the trigger.
   */
  trigger?: ReactElement<{ onPress?: () => void }>;
  /** Accessible name of the overlay. */
  "aria-label": string;
  children: ReactNode | ((opts: { close: () => void }) => ReactNode);
  /**
   * Accepted so a shared call site compiles on both platforms, and ignored: on a phone the
   * overlay is always a tray. The other positioning props of the Web part (`offset`,
   * `crossOffset`, `shouldFlip`, `triggerRef` and the like) are not accepted.
   */
  placement?: PopoverPlacement;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * The overlay for Menu, Popover, ContextualHelp and similar content. The Web part is a popover
 * on tablet and wider and a tray below it; the phone part is always a `Tray` (design-spec 4.5),
 * tablets included, because a bottom sheet is a native pattern at every size.
 */
export function ResponsivePopover({
  trigger,
  children,
  "aria-label": ariaLabel,
  placement: _placement,
  ...openState
}: ResponsivePopoverProps) {
  return (
    <Tray trigger={trigger} aria-label={ariaLabel} {...openState}>
      {children}
    </Tray>
  );
}
