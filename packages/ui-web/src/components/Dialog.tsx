import { i18n } from "@moonx/i18n";
import type { DialogSize, DialogWidth } from "@moonx/ui-tokens";
import { CircleAlert, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useId } from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import { FixedLocale } from "../internal/FixedLocale";
import { IconSlot } from "../internal/IconSlot";
import { OverlayContexts } from "../internal/OverlayContexts";
import * as overlay from "../internal/overlay.css";
import { useIsNarrow } from "../internal/useIsNarrow";
import { ActionButton } from "./ActionButton";
import { Button, ButtonGroup } from "./Button";
import * as styles from "./Dialog.css";
import { Heading } from "./Heading";

type Content = ReactNode | ((options: { close: () => void }) => ReactNode);

const render = (content: Content, close: () => void) =>
  typeof content === "function" ? content({ close }) : content;

export interface DialogTriggerProps {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** The button that opens it, then the Dialog, AlertDialog or Popover. */
  children: ReactNode;
}

/**
 * Opens the Dialog, AlertDialog or Popover inside it from the button before it, and
 * returns focus to that button when it closes.
 */
export function DialogTrigger(props: DialogTriggerProps) {
  return <AriaDialogTrigger {...props} />;
}

interface FrameProps {
  title: ReactNode;
  size: DialogSize;
  role: "dialog" | "alertdialog";
  isDismissable: boolean;
  isKeyboardDismissDisabled: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  titleIcon?: ReactNode;
  children: Content;
  buttons?: Content;
  "aria-describedby"?: string;
}

/**
 * The frame both dialogs share. Tablet and wider: a card in the middle of the screen.
 * Narrower: small and medium become a tray, large a full-screen sheet; fullscreen fills
 * the window at every width (design-spec 3.8・4.5).
 */
function DialogFrame({
  title,
  size,
  role,
  isDismissable,
  isKeyboardDismissDisabled,
  titleIcon,
  children,
  buttons,
  "aria-describedby": describedBy,
  ...state
}: FrameProps) {
  const isNarrow = useIsNarrow();
  const bodyId = useId();
  // An AlertDialog is a tray on a phone at any size: it waits for an answer (4.5).
  const form =
    role === "alertdialog"
      ? isNarrow
        ? "tray"
        : "centered"
      : size === "fullscreen" || (isNarrow && size === "L")
        ? "sheet"
        : isNarrow
          ? "tray"
          : "centered";
  const frame = {
    sheet: { overlay: overlay.sheetOverlay, modal: overlay.sheet },
    tray: { overlay: overlay.trayOverlay, modal: overlay.tray },
    centered: {
      overlay: overlay.centeredOverlay,
      modal: `${overlay.centeredFrame} ${size === "fullscreen" ? "" : overlay.dialogWidth[size]}`,
    },
  }[form];
  return (
    <FixedLocale>
      <ModalOverlay
        {...state}
        isDismissable={isDismissable}
        isKeyboardDismissDisabled={isKeyboardDismissDisabled}
        className={frame.overlay}
      >
        <Modal className={frame.modal}>
          <OverlayContexts>
            <AriaDialog
              role={role}
              // An alert's body is what it asks, so it describes the dialog by default.
              aria-describedby={
                describedBy ?? (role === "alertdialog" ? bodyId : undefined)
              }
              className={styles.dialog}
            >
              {({ close }) => (
                <>
                  <div className={styles.header}>
                    <Heading level={2} slot="title">
                      <span className={styles.title}>
                        {titleIcon}
                        {title}
                      </span>
                    </Heading>
                    {isDismissable && (
                      <span className={styles.close}>
                        <ActionButton
                          isQuiet
                          aria-label={i18n.t("components:dialog.close")}
                          onPress={close}
                        >
                          <X />
                        </ActionButton>
                      </span>
                    )}
                  </div>
                  <div id={bodyId} className={styles.body}>
                    {render(children, close)}
                  </div>
                  {buttons !== undefined && (
                    <div className={styles.footer}>
                      {render(buttons, close)}
                    </div>
                  )}
                </>
              )}
            </AriaDialog>
          </OverlayContexts>
        </Modal>
      </ModalOverlay>
    </FixedLocale>
  );
}

export interface DialogProps {
  /** The heading; it also names the dialog for screen readers. */
  title: ReactNode;
  /**
   * `S` / `M` / `L` / `fullscreen`. Which modal takes which is design-spec 3.8.
   * @default "M"
   */
  size?: DialogSize;
  /**
   * Shows a close button and lets a press outside close it. Escape closes any Dialog
   * unless `isKeyboardDismissDisabled`.
   * @default false
   */
  isDismissable?: boolean;
  /** @default false */
  isKeyboardDismissDisabled?: boolean;
  /** Open state, when the screen holds it rather than a `DialogTrigger`. */
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** The body, or a function that receives `close`. It scrolls when it is too tall. */
  children: Content;
  /**
   * The actions under the body, usually a `ButtonGroup` aligned to the end. They stay in
   * view while the body scrolls.
   */
  buttons?: Content;
  "aria-describedby"?: string;
}

/** A modal dialog (M1〜M9, 15's competitor editor; design-spec 3.8). */
export function Dialog({
  size = "M",
  isDismissable = false,
  isKeyboardDismissDisabled = false,
  ...props
}: DialogProps) {
  return (
    <DialogFrame
      {...props}
      role="dialog"
      size={size}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
    />
  );
}

export interface AlertDialogProps {
  title: ReactNode;
  /**
   * `destructive` makes the primary action negative (deletion only, design-spec 4.5).
   * `error` and `warning` put a red or amber sign before the title. `confirmation` and
   * `information` look the same: moonx has no accent colour.
   * @default "confirmation"
   */
  variant?:
    | "confirmation"
    | "information"
    | "destructive"
    | "error"
    | "warning";
  /**
   * The width on tablet and wider. A phone always shows a tray (design-spec 4.5).
   * @default "M"
   */
  size?: DialogWidth;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  /** Without it there is no cancel button. */
  cancelLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onCancel?: () => void;
  isPrimaryActionDisabled?: boolean;
  isSecondaryActionDisabled?: boolean;
  /** Which button takes focus when it opens; without it the dialog itself does. */
  autoFocusButton?: "primary" | "secondary" | "cancel";
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  children: ReactNode;
}

/**
 * A question to answer before going on: deleting, the save conflict (design-spec 6.0.2),
 * the error of a modal (6.0.6). It stays until a button is pressed: neither Escape nor a
 * press outside closes it, at any width (on a phone it is a tray that cannot be
 * dismissed, design-spec 4.5).
 */
export function AlertDialog({
  variant = "confirmation",
  size = "M",
  primaryActionLabel,
  secondaryActionLabel,
  cancelLabel,
  onPrimaryAction,
  onSecondaryAction,
  onCancel,
  isPrimaryActionDisabled,
  isSecondaryActionDisabled,
  autoFocusButton,
  children,
  ...props
}: AlertDialogProps) {
  // Named, as Spectrum 2 names it: the sign says more than the title's colour.
  const titleIcon =
    variant === "error" || variant === "warning" ? (
      <span
        role="img"
        aria-label={i18n.t("components:alertDialog.alert")}
        className={styles.alertIcon[variant]}
      >
        <IconSlot size="L">
          {variant === "error" ? <CircleAlert /> : <TriangleAlert />}
        </IconSlot>
      </span>
    ) : undefined;
  return (
    <DialogFrame
      {...props}
      role="alertdialog"
      size={size}
      isDismissable={false}
      isKeyboardDismissDisabled
      titleIcon={titleIcon}
      buttons={({ close }) => (
        <ButtonGroup align="end">
          {cancelLabel !== undefined && (
            <Button
              variant="secondary"
              autoFocus={autoFocusButton === "cancel"}
              onPress={() => {
                close();
                onCancel?.();
              }}
            >
              {cancelLabel}
            </Button>
          )}
          {secondaryActionLabel !== undefined && (
            <Button
              variant="secondary"
              isDisabled={isSecondaryActionDisabled}
              autoFocus={autoFocusButton === "secondary"}
              onPress={() => {
                close();
                onSecondaryAction?.();
              }}
            >
              {secondaryActionLabel}
            </Button>
          )}
          <Button
            variant={variant === "destructive" ? "negative" : "primary"}
            isDisabled={isPrimaryActionDisabled}
            autoFocus={autoFocusButton === "primary"}
            onPress={() => {
              close();
              onPrimaryAction?.();
            }}
          >
            {primaryActionLabel}
          </Button>
        </ButtonGroup>
      )}
    >
      {children}
    </DialogFrame>
  );
}
