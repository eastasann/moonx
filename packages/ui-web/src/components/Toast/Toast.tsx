import type { ToastVariant } from "@moonx/ui-tokens";
import { Bell, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import {
  Button as AriaButton,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastQueue as AriaToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
  Text,
} from "react-aria-components";
import { close, content, icon, region, title, toast } from "./Toast.css";

/** What a toast shows. Put the text from `packages/i18n` here. */
export interface ToastMessage {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

const ICONS = {
  informative: Info,
  positive: CircleCheck,
  negative: CircleAlert,
  neutral: Bell,
} as const satisfies Record<ToastVariant, unknown>;

/** Milliseconds a toast stays when `add` is called without a `timeout`. */
export const DEFAULT_TOAST_TIMEOUT = 5000;

class ToastQueueWithTimeout extends AriaToastQueue<ToastMessage> {
  override add(
    message: ToastMessage,
    options?: Parameters<AriaToastQueue<ToastMessage>["add"]>[1],
  ) {
    return super.add(message, { timeout: DEFAULT_TOAST_TIMEOUT, ...options });
  }
}

export type ToastQueue = AriaToastQueue<ToastMessage>;

/**
 * Creates the queue that screens add toasts to (`queue.add({ title, variant })`) and a
 * `ToastRegion` shows. Create one per app, at module level.
 */
export function createToastQueue(options?: { maxVisibleToasts?: number }): ToastQueue {
  return new ToastQueueWithTimeout(options);
}

export interface ToastRegionProps {
  queue: ToastQueue;
  /** Accessible name of the region, for example "Notifications". */
  label: string;
  /** Accessible name of each toast's close button. */
  closeLabel: string;
}

/**
 * Shows the toasts of a queue at the bottom of the screen, above the tab bar on narrow screens.
 * Mount it once, near the root.
 */
export function ToastRegion({ queue, label, closeLabel }: ToastRegionProps) {
  return (
    <AriaToastRegion queue={queue} aria-label={label} className={region}>
      {({ toast: queued }) => {
        const variant = queued.content.variant ?? "neutral";
        const Icon = ICONS[variant];
        return (
          <AriaToast toast={queued} className={toast({ variant })}>
            <Icon aria-hidden className={icon} />
            <AriaToastContent className={content}>
              <Text slot="title" className={title}>
                {queued.content.title}
              </Text>
              {queued.content.description ? (
                <Text slot="description">{queued.content.description}</Text>
              ) : null}
            </AriaToastContent>
            <AriaButton slot="close" aria-label={closeLabel} className={close}>
              <X aria-hidden className={icon} />
            </AriaButton>
          </AriaToast>
        );
      }}
    </AriaToastRegion>
  );
}
