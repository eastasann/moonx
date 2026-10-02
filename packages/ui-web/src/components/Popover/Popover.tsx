import type { ReactElement, ReactNode } from "react";
import { Dialog as AriaDialog, DialogTrigger } from "react-aria-components";
import { ResponsivePopover, type ResponsivePopoverProps } from "../ResponsivePopover";
import { content } from "./Popover.css";

export interface PopoverProps {
  /** The element that opens the popover. It must be a React Aria pressable such as `Button`. */
  trigger?: ReactElement;
  /** Accessible name of the popover. */
  "aria-label": string;
  children: ReactNode | ((opts: { close: () => void }) => ReactNode);
  placement?: ResponsivePopoverProps["placement"];
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A popover on tablet and wider, a tray below `semantic.breakpoint.tablet` (design-spec 4.5).
 */
export function Popover({
  trigger,
  children,
  placement,
  "aria-label": ariaLabel,
  ...triggerProps
}: PopoverProps) {
  return (
    <DialogTrigger {...triggerProps}>
      {trigger}
      <ResponsivePopover placement={placement}>
        <AriaDialog aria-label={ariaLabel} className={content}>
          {children}
        </AriaDialog>
      </ResponsivePopover>
    </DialogTrigger>
  );
}
