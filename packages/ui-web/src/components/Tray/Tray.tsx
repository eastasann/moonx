import type { ReactElement, ReactNode } from "react";
import { Dialog as AriaDialog, DialogTrigger, Modal, ModalOverlay } from "react-aria-components";
import { tray, trayOverlay } from "../ResponsivePopover/ResponsivePopover.css";
import { content } from "./Tray.css";

export interface TrayProps {
  /** The element that opens the tray. It must be a React Aria pressable such as `Button`. */
  trigger?: ReactElement;
  /** Accessible name of the tray. */
  "aria-label": string;
  children: ReactNode | ((opts: { close: () => void }) => ReactNode);
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A bottom sheet at every width. Use `Popover` when the content should be a popover on wide
 * screens; use `Tray` when it is a tray everywhere (design-spec 4.5).
 */
export function Tray({ trigger, children, "aria-label": ariaLabel, ...openState }: TrayProps) {
  const overlay = (state: Pick<TrayProps, "isOpen" | "defaultOpen" | "onOpenChange">) => (
    <ModalOverlay {...state} isDismissable className={trayOverlay}>
      <Modal className={tray}>
        <AriaDialog aria-label={ariaLabel} className={content}>
          {children}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
  // Without a trigger the tray is driven by `isOpen`. A `DialogTrigger` with no pressable child
  // makes React Aria warn, so the overlay stands alone then.
  if (!trigger) return overlay(openState);
  return (
    <DialogTrigger {...openState}>
      {trigger}
      {overlay({})}
    </DialogTrigger>
  );
}
