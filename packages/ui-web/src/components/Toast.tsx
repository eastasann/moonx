import { X } from "lucide-react";
import { useContext, useSyncExternalStore } from "react";
import {
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastQueue as AriaToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
  UNSTABLE_ToastStateContext as AriaToastStateContext,
  type QueuedToast,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { FixedLocale } from "../internal/FixedLocale";
import { ActionButton } from "./ActionButton";
import { Button } from "./Button";
import { Text } from "./Text";
import * as styles from "./Toast.css";

interface ToastContent {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  shouldCloseOnAction?: boolean;
}

export interface ToastOptions {
  /** A button in the toast, such as "Undo" after duplicating (design-spec 6.8). */
  actionLabel?: string;
  onAction?: () => void;
  /** Closes the toast once the action is pressed. */
  shouldCloseOnAction?: boolean;
  /**
   * Milliseconds before it closes by itself, at least 5000 (Spectrum's minimum). Ignored
   * with an action, which stays until pressed or closed. Without it the toast stays.
   */
  timeout?: number;
  onClose?: () => void;
}

/** Spectrum's minimum time a toast stays on screen. */
const MIN_TIMEOUT_MS = 5000;

// Every toast shows until it closes, as in Spectrum 2's queue.
const queue = new AriaToastQueue<ToastContent>();

/**
 * Shows toasts in the app's `ToastContainer` ("Decision recorded", "2 answers updated ·
 * 1 needs F/A/U"). Each call returns a function that closes that toast.
 */
export const ToastQueue = {
  neutral(message: string, options: ToastOptions = {}): () => void {
    const { timeout, onClose, ...action } = options;
    const key = queue.add(
      { message, ...action },
      {
        timeout:
          timeout !== undefined && action.actionLabel === undefined
            ? Math.max(timeout, MIN_TIMEOUT_MS)
            : undefined,
        onClose,
      },
    );
    return () => queue.close(key);
  },
};

function ToastBody({ toast }: { toast: QueuedToast<ToastContent> }) {
  const { t } = useTranslation(["components"]);
  const state = useContext(AriaToastStateContext);
  if (state === null)
    throw new Error("A toast renders only in a ToastContainer.");
  const { message, actionLabel, onAction, shouldCloseOnAction } = toast.content;
  return (
    <AriaToast toast={toast} className={styles.toast}>
      <AriaToastContent className={styles.content}>
        <Text slot="title">{message}</Text>
      </AriaToastContent>
      <div className={styles.actions}>
        {actionLabel !== undefined && (
          <Button
            variant="secondary"
            size="S"
            onPress={() => {
              onAction?.();
              if (shouldCloseOnAction) state.close(toast.key);
            }}
          >
            {actionLabel}
          </Button>
        )}
        <ActionButton
          isQuiet
          aria-label={t("components:toast.close")}
          onPress={() => state.close(toast.key)}
        >
          <X />
        </ActionButton>
      </div>
    </AriaToast>
  );
}

export interface ToastContainerProps {
  /**
   * On a phone, sits above the TabBar rather than at the bottom edge. The app frame sets
   * it on screens that show the TabBar.
   * @default false
   */
  aboveTabBar?: boolean;
}

/** Where the toasts appear: put one in the app's root. */
export function ToastContainer({ aboveTabBar = false }: ToastContainerProps) {
  const { t } = useTranslation(["components"]);
  const count = useSyncExternalStore(
    (onChange) => queue.subscribe(onChange),
    () => queue.visibleToasts.length,
    () => 0,
  );
  return (
    <FixedLocale>
      <AriaToastRegion
        queue={queue}
        aria-label={t("components:toast.region", { count })}
        className={styles.region({ aboveTabBar })}
      >
        {({ toast }) => <ToastBody toast={toast} />}
      </AriaToastRegion>
    </FixedLocale>
  );
}
