import type { ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import {
  Tooltip as AriaTooltip,
  type TooltipProps as AriaTooltipProps,
  TooltipTrigger,
} from "react-aria-components";
import { tooltip } from "./Tooltip.css";

export interface TooltipProps {
  /** The element the tooltip describes. It must be focusable, such as a `Button`. */
  children: ReactNode;
  /** The text shown. Keep it to a short phrase; anything longer belongs in ContextualHelp. */
  content: ReactNode;
  placement?: AriaTooltipProps["placement"];
  /** Text size. Without it the tooltip uses the caption size. */
  size?: ComponentSize;
  /** Milliseconds before it opens on hover. */
  delay?: number;
  closeDelay?: number;
  isDisabled?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/** Describes an icon-only button on hover and keyboard focus. */
export function Tooltip({
  children,
  content,
  placement = "top",
  size,
  ...triggerProps
}: TooltipProps) {
  return (
    <TooltipTrigger {...triggerProps}>
      {children}
      <AriaTooltip placement={placement} className={tooltip({ size })}>
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
