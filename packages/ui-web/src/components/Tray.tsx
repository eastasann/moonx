import type { ReactNode } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { FixedLocale } from "../internal/FixedLocale";
import { OverlayContexts } from "../internal/OverlayContexts";
import * as styles from "../internal/overlay.css";

interface SheetProps {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  isDismissable?: boolean;
  children: ReactNode;
}

/**
 * The bottom sheet alone, for overlays whose content brings its own role (a Picker's
 * list, a Menu, a DatePicker's calendar dialog). Not exported from the package.
 */
export function TraySheet({
  isDismissable = true,
  children,
  ...state
}: SheetProps) {
  return (
    <ModalOverlay
      {...state}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={!isDismissable}
      className={styles.trayOverlay}
    >
      <Modal className={styles.tray}>
        <OverlayContexts>{children}</OverlayContexts>
      </Modal>
    </ModalOverlay>
  );
}

export interface TrayProps {
  /** Open state, when the screen holds it. Inside a `DialogTrigger` the trigger holds it. */
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * Whether a tap on the backdrop or Escape closes it. Set false for content that must be
   * answered first (design-spec 4.5).
   * @default true
   */
  isDismissable?: boolean;
  /** Names the tray's dialog when no heading inside does. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** The content, or a function that receives `close`. It scrolls when it is too tall. */
  children: ReactNode | ((options: { close: () => void }) => ReactNode);
}

/**
 * A bottom sheet holding a dialog: as wide as the window, at most 85% of the visible
 * height, rising above the on-screen keyboard (design-spec 4.3・4.5). Popover, Menu,
 * Picker, ComboBox, DatePicker, ContextualHelp and Dialog become one on a phone by
 * themselves; use it directly only for content that is a sheet at every width.
 */
export function Tray({
  isDismissable,
  isOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...dialogProps
}: TrayProps) {
  return (
    <FixedLocale>
      <TraySheet
        isDismissable={isDismissable}
        isOpen={isOpen}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
      >
        <Dialog {...dialogProps} className={styles.popoverDialog}>
          {children}
        </Dialog>
      </TraySheet>
    </FixedLocale>
  );
}
