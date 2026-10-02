import { CircleQuestionMark, Info } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger,
  Heading,
} from "react-aria-components";
import { ResponsivePopover, type ResponsivePopoverProps } from "../ResponsivePopover";
import { content, icon, title as titleClass, trigger } from "./ContextualHelp.css";

export interface ContextualHelpProps {
  /** `help` is for how to fill in a field (a question mark); `info` is for background (an i). */
  variant?: "help" | "info";
  /** Accessible name of the icon button that opens the help. */
  label: string;
  /** Heading inside the help; it is also the accessible name of the popover. */
  title: string;
  children: ReactNode;
  placement?: ResponsivePopoverProps["placement"];
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/** An icon button that opens a short explanation: a popover on wide screens, a tray on narrow ones. */
export function ContextualHelp({
  variant = "help",
  label,
  title,
  children,
  placement = "bottom start",
  ...triggerProps
}: ContextualHelpProps) {
  const Icon = variant === "help" ? CircleQuestionMark : Info;
  return (
    <DialogTrigger {...triggerProps}>
      <AriaButton aria-label={label} className={trigger}>
        <Icon aria-hidden className={icon} />
      </AriaButton>
      <ResponsivePopover placement={placement}>
        <AriaDialog className={content}>
          <Heading slot="title" level={3} className={titleClass}>
            {title}
          </Heading>
          {children}
        </AriaDialog>
      </ResponsivePopover>
    </DialogTrigger>
  );
}
