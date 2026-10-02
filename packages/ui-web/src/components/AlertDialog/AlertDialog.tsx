import { type ReactElement, type ReactNode, useRef } from "react";
import { Button } from "../Button";
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogSurface,
  DialogTitle,
} from "../Dialog/Dialog";

export interface AlertDialogProps {
  /** The element that opens the dialog. Omit it to control the dialog with `isOpen`. */
  trigger?: ReactElement;
  title: string;
  /** The question or the consequence being confirmed. */
  children: ReactNode;
  /**
   * `negative` is for confirming a deletion: the confirm button is red and focus starts on the
   * cancel button.
   */
  variant?: "confirmation" | "negative";
  primaryActionLabel: string;
  cancelLabel: string;
  /** Called once when the primary button is pressed, before the dialog closes. */
  onPrimaryAction?: () => void;
  /**
   * Called once whenever the dialog closes by any route other than the primary button: the
   * cancel button or Esc. It is not called when a controlled `isOpen` is set to false from
   * outside, because the component cannot tell why the parent closed it.
   */
  onCancel?: () => void;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A confirmation that has to be answered: it does not close on an outside press and has no close
 * button. Esc closes it and counts as a cancel. A tray below `semantic.breakpoint.tablet` (design-spec 3.8).
 */
export function AlertDialog({
  title,
  children,
  variant = "confirmation",
  primaryActionLabel,
  cancelLabel,
  onPrimaryAction,
  onCancel,
  onOpenChange,
  ...surfaceProps
}: AlertDialogProps) {
  const negative = variant === "negative";
  const confirmed = useRef(false);
  const handleOpenChange = (open: boolean) => {
    if (!open && !confirmed.current) onCancel?.();
    confirmed.current = false;
    onOpenChange?.(open);
  };
  return (
    <DialogSurface
      size="small"
      role="alertdialog"
      onOpenChange={handleOpenChange}
      {...surfaceProps}
    >
      {({ close }) => (
        <>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>{children}</DialogBody>
          <DialogFooter>
            <Button variant="secondary" autoFocus={negative} onPress={close}>
              {cancelLabel}
            </Button>
            <Button
              variant={negative ? "negative" : "primary"}
              autoFocus={!negative}
              onPress={() => {
                confirmed.current = true;
                onPrimaryAction?.();
                close();
              }}
            >
              {primaryActionLabel}
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogSurface>
  );
}
