import type { DialogSize } from "@moonx/ui-tokens";
import type { ReactElement, ReactNode } from "react";
import {
  type CloseRender,
  DialogBody,
  DialogCloseButton,
  DialogFooter,
  DialogHeader,
  DialogSurface,
  DialogTitle,
} from "./DialogSurface";

export interface DialogProps {
  /** The element that opens the dialog. Omit it to control the dialog with `isOpen`. */
  trigger?: ReactElement<{ onPress?: () => void }>;
  /** Heading of the dialog; it is also its accessible name. */
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  /**
   * `fullscreen` is a full-screen sheet; the other sizes are a tray. The phone has no centered
   * dialog, so `small`, `medium` and `large` look the same (design-spec 3.8).
   */
  size?: DialogSize;
  children: ReactNode | ((opts: CloseRender) => ReactNode);
  /** Decision buttons, laid out at the end of the dialog. */
  actions?: ReactNode | ((opts: CloseRender) => ReactNode);
  /**
   * Whether a swipe down, a tap on the backdrop or the back button closes the tray sizes.
   * Defaults to true. A full-screen sheet has no outside to press.
   */
  isDismissable?: boolean;
  /**
   * Turns off closing with the Android back button on a full-screen sheet, for example while a
   * submit is in flight. A tray cannot turn its back-button close off.
   */
  isKeyboardDismissDisabled?: boolean;
  /**
   * Leaves out the close button, for a dialog that can only end with one of its `actions`, such as
   * the choice after a conflict (design-spec 6.0.2).
   */
  isCloseHidden?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A modal dialog (M1 to M8 and the confirmations of design-spec 3.8). It always has a close
 * button unless `isCloseHidden`; a tray for `small`, `medium` and `large`, a full-screen sheet
 * for `fullscreen`.
 */
export function Dialog({
  title: heading,
  closeLabel,
  size = "medium",
  children,
  actions,
  isCloseHidden = false,
  ...surfaceProps
}: DialogProps) {
  return (
    <DialogSurface size={size} aria-label={heading} {...surfaceProps}>
      {({ close }) => (
        <>
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            {isCloseHidden ? null : <DialogCloseButton label={closeLabel} onPress={close} />}
          </DialogHeader>
          <DialogBody>{typeof children === "function" ? children({ close }) : children}</DialogBody>
          {actions ? (
            <DialogFooter>
              {typeof actions === "function" ? actions({ close }) : actions}
            </DialogFooter>
          ) : null}
        </>
      )}
    </DialogSurface>
  );
}
