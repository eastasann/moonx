import type { DialogSize } from "@moonx/ui-tokens";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import { useIsNarrow } from "../ResponsivePopover";
import {
  body,
  closeButton,
  closeIcon,
  dialog,
  footer,
  header,
  modal,
  overlay,
  title,
} from "./Dialog.css";

type CloseRender = { close: () => void };

export interface DialogProps {
  /** The element that opens the dialog. Omit it to control the dialog with `isOpen`. */
  trigger?: ReactElement;
  /** Heading of the dialog; it is also its accessible name. */
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  /**
   * `fullscreen` is a full-screen sheet below `semantic.breakpoint.tablet`; the other sizes
   * become a tray there (design-spec 3.8).
   */
  size?: DialogSize;
  children: ReactNode | ((opts: CloseRender) => ReactNode);
  /** Decision buttons, laid out at the end of the dialog. */
  actions?: ReactNode | ((opts: CloseRender) => ReactNode);
  /** Closes on a press outside. Off by default so a stray tap does not drop what was typed. */
  isDismissable?: boolean;
  /** Turns off closing with Esc, for example while a submit is in flight. */
  isKeyboardDismissDisabled?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export interface DialogSurfaceProps {
  trigger?: ReactElement;
  size: DialogSize;
  role?: "dialog" | "alertdialog";
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  children: (opts: CloseRender) => ReactNode;
}

/**
 * The overlay shared by Dialog and AlertDialog: centered at tablet width and up, a tray or a
 * full-screen sheet below it. Not part of the public API.
 */
export function DialogSurface({
  trigger,
  size,
  role,
  isDismissable,
  isKeyboardDismissDisabled,
  children,
  ...triggerProps
}: DialogSurfaceProps) {
  const narrow = useIsNarrow();
  const layout = narrow ? (size === "fullscreen" ? "sheet" : "tray") : size;
  return (
    <DialogTrigger {...triggerProps}>
      {trigger}
      <ModalOverlay
        isDismissable={isDismissable}
        isKeyboardDismissDisabled={isKeyboardDismissDisabled}
        className={overlay({ layout })}
      >
        <Modal className={modal({ layout })}>
          <AriaDialog role={role} className={dialog}>
            {children}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

/** The `h2` that names a dialog. Not part of the public API. */
export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <Heading slot="title" level={2} className={title}>
      {children}
    </Heading>
  );
}

/** Not part of the public API. */
export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className={header}>{children}</div>;
}

/** Not part of the public API. */
export function DialogBody({ children }: { children: ReactNode }) {
  return <div className={body}>{children}</div>;
}

/** Not part of the public API. */
export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className={footer}>{children}</div>;
}

/**
 * A modal dialog (M1 to M8 and the confirmations of design-spec 3.8). It always has a close
 * button; wide screens center it in one of four sizes, narrow screens show a tray or, for
 * `fullscreen`, a full-screen sheet.
 */
export function Dialog({
  title: heading,
  closeLabel,
  size = "medium",
  children,
  actions,
  isDismissable = false,
  ...surfaceProps
}: DialogProps) {
  return (
    <DialogSurface size={size} isDismissable={isDismissable} {...surfaceProps}>
      {({ close }) => (
        <>
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <AriaButton aria-label={closeLabel} onPress={close} className={closeButton}>
              <X aria-hidden className={closeIcon} />
            </AriaButton>
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
