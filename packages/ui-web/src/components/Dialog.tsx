import type { DialogSize, DialogWidth, ScreenDensity } from "@moonx/ui-tokens";
import { CircleAlert, TriangleAlert, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useContext, useId } from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Modal,
  ModalOverlay,
  OverlayTriggerStateContext,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Density } from "../internal/Density";
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
  density: ScreenDensity;
  isDismissable: boolean;
  isKeyboardDismissDisabled: boolean;
  /** Escape answers it this way, after closing it; without it, Escape is left to React Aria. */
  onEscape?: () => void;
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
  density,
  isDismissable,
  isKeyboardDismissDisabled,
  onEscape,
  titleIcon,
  children,
  buttons,
  "aria-describedby": describedBy,
  ...state
}: FrameProps) {
  const { t } = useTranslation(["components"]);
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
            <Density density={density}>
              <EscapeAnswer onEscape={onEscape}>
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
                              aria-label={t("components:dialog.close")}
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
              </EscapeAnswer>
            </Density>
          </OverlayContexts>
        </Modal>
      </ModalOverlay>
    </FixedLocale>
  );
}

/**
 * With `onEscape`, Escape inside the dialog closes the modal around and answers so. A
 * wrapper without a box of its own: React Aria's Dialog takes no keyboard handlers.
 */
function EscapeAnswer({
  onEscape,
  children,
}: {
  onEscape?: () => void;
  children: ReactNode;
}) {
  const state = useContext(OverlayTriggerStateContext);
  if (onEscape === undefined) return children;
  const onKeyDown = (event: KeyboardEvent) => {
    // The key is a part's when the part takes it: an overlay opened from the dialog (a
    // portal, outside this element), a ComboBox whose list is open (it lets Escape go on
    // after closing the list), a key held down past the first press, or the Escape that
    // ends an IME composition (Safari reports it as 229).
    const target = event.target as Element;
    if (
      event.key !== "Escape" ||
      event.repeat ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      !event.currentTarget.contains(target) ||
      (target.getAttribute("role") === "combobox" &&
        target.getAttribute("aria-expanded") === "true")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    state?.close();
    onEscape();
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only hears keys pressed in the dialog inside, which has the role.
    <div onKeyDown={onKeyDown} className={styles.escapeAnswer}>
      {children}
    </div>
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
   * The density of what is inside (design-spec 4.4): M1〜M9 are spacious, so their fields
   * and Buttons are L, inside a `Form` or not; 15's competitor editor is regular.
   * @default "regular"
   */
  density?: ScreenDensity;
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
  density = "regular",
  isDismissable = false,
  isKeyboardDismissDisabled = false,
  ...props
}: DialogProps) {
  return (
    <DialogFrame
      {...props}
      role="dialog"
      size={size}
      density={density}
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
  /** Without it there is no cancel button, and Escape does nothing. */
  cancelLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  /** The cancel button, or Escape, was pressed: nothing is to change. */
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
 * the error of a modal (6.0.6). It stays until it is answered: a press outside does not
 * close it at any width (on a phone it is a tray that cannot be dismissed). Escape is the
 * cancel button's answer, as WAI-ARIA's dialog has it; without a cancel button it does
 * nothing (design-spec 4.5).
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
  const { t } = useTranslation(["components"]);
  // Named, as Spectrum 2 names it: the sign says more than the title's colour.
  const titleIcon =
    variant === "error" || variant === "warning" ? (
      <span
        role="img"
        aria-label={t("components:alertDialog.alert")}
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
      density="regular"
      isDismissable={false}
      isKeyboardDismissDisabled
      onEscape={cancelLabel === undefined ? undefined : () => onCancel?.()}
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
