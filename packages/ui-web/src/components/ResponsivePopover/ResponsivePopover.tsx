import type { ReactNode } from "react";
import { useIsHidden } from "react-aria/private/collections/Hidden";
import { Modal, ModalOverlay, Popover, type PopoverProps } from "react-aria-components";
import { popover, tray, trayOverlay } from "./ResponsivePopover.css";
import { useIsNarrow } from "./useIsNarrow";

export interface ResponsivePopoverProps
  extends Omit<PopoverProps, "className" | "style" | "children"> {
  children: ReactNode;
}

/**
 * The overlay for Picker, ComboBox, Menu, DatePicker and Popover content: a popover on tablet
 * and wider, a tray (bottom sheet) below `semantic.breakpoint.tablet`. Place it where React Aria
 * expects a `Popover`; both forms read the open state from the surrounding trigger.
 */
export function ResponsivePopover({ children, ...props }: ResponsivePopoverProps) {
  const narrow = useIsNarrow();
  // React Aria first builds the collection of a Picker or ComboBox in a hidden render, where an
  // overlay that renders nothing would leave the list unregistered.
  if (useIsHidden()) return <>{children}</>;
  if (narrow) {
    return (
      <ModalOverlay isDismissable className={trayOverlay}>
        <Modal className={tray}>{children}</Modal>
      </ModalOverlay>
    );
  }
  return (
    <Popover {...props} className={popover}>
      {children}
    </Popover>
  );
}
