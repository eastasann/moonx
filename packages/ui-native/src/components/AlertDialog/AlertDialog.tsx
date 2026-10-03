import { type ReactElement, type ReactNode, useRef } from "react";
import { Button } from "../Button";
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogSurface,
  DialogTitle,
} from "../Dialog/DialogSurface";

export interface AlertDialogProps {
  /** The element that opens the dialog. Omit it to control the dialog with `isOpen`. */
  trigger?: ReactElement<{ onPress?: () => void }>;
  title: string;
  /** The question or the consequence being confirmed. */
  children: ReactNode;
  /**
   * `negative` is for confirming a deletion: the confirm button is red. The Web part also starts
   * focus on the cancel button; a phone has no initial focus to place.
   */
  variant?: "confirmation" | "negative";
  primaryActionLabel: string;
  cancelLabel: string;
  /** Called once when the primary button is pressed, before the dialog closes. */
  onPrimaryAction?: () => void;
  /**
   * Called once whenever the dialog closes by any route other than the primary button. The dialog
   * has to be answered, so in practice that is the cancel button. It is not called when a
   * controlled `isOpen` is set to false from outside, because the component cannot tell why the
   * parent closed it.
   */
  onCancel?: () => void;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A confirmation: a tray with a cancel and a confirm button and no close button (design-spec
 * 3.8). It has to be answered: a swipe, a backdrop tap and the back button do nothing.
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
      isDismissable={false}
      aria-label={title}
      {...surfaceProps}
      onOpenChange={handleOpenChange}
    >
      {({ close }) => (
        <>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>{children}</DialogBody>
          <DialogFooter>
            <Button variant="secondary" onPress={close}>
              {cancelLabel}
            </Button>
            <Button
              variant={negative ? "negative" : "primary"}
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
