import type { ReactNode } from "react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import {
  Tooltip as AriaTooltip,
  type TooltipProps as AriaTooltipProps,
  TooltipTrigger as AriaTooltipTrigger,
  type TooltipTriggerComponentProps,
} from "react-aria-components";
import { useControlledState } from "../internal/useControlledState";
import * as styles from "./Tooltip.css";

/** React Aria's long-press threshold (useLongPress). */
const LONG_PRESS_MS = 500;
/** Android's ViewConfiguration long-press tooltip hide timeout. */
const TOUCH_HIDE_MS = 1500;
/**
 * How long after the finger lifts its click or context menu is still blocked. React Aria's
 * useLongPress waits the same, as browsers fire them right after the lift.
 */
const AFTER_LIFT_MS = 100;

/**
 * Closes the tooltip that a long press opened, so a second long press elsewhere leaves
 * one open, as React Aria keeps one open for hover and focus.
 */
let closeTouchTooltip: (() => void) | undefined;

export interface TooltipTriggerProps
  extends Pick<
    TooltipTriggerComponentProps,
    "delay" | "closeDelay" | "isDisabled"
  > {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** The button it describes, then the `Tooltip`. */
  children: ReactNode;
}

/**
 * Shows the `Tooltip` inside it when the button before it is hovered or reached by
 * keyboard. On a touch screen, which has no hover, a long press opens it and it closes a
 * moment after the finger lifts (design-spec 4.5). A tap still presses the button; a long
 * press shows the tooltip instead of pressing it, as React Aria's long press does.
 */
export function TooltipTrigger({
  isOpen,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: TooltipTriggerProps) {
  const [open, setOpen] = useControlledState(
    isOpen,
    defaultOpen ?? false,
    onOpenChange,
  );
  const pressTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const stopListening = useRef<() => void>(() => {});
  const latestSetOpen = useRef(setOpen);
  latestSetOpen.current = setOpen;
  // One function for the life of the trigger, so the module can tell whose tooltip is open.
  const [close] = useState(() => () => latestSetOpen.current(false));

  useEffect(
    () => () => {
      window.clearTimeout(pressTimer.current);
      window.clearTimeout(hideTimer.current);
      stopListening.current();
      if (closeTouchTooltip === close) closeTouchTooltip = undefined;
    },
    [close],
  );

  const onPointerDownCapture = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType !== "touch" || props.isDisabled) return;
    // React passes events up from portals: a press inside the open tooltip is not one.
    if (!event.currentTarget.contains(event.target as Node)) return;
    // The finger lands on the icon inside; the button around it is the trigger, the
    // element useLongPress measures and listens on.
    const target = event.target as Element;
    let trigger = target;
    while (
      trigger.parentElement !== null &&
      trigger.parentElement !== event.currentTarget
    ) {
      trigger = trigger.parentElement;
    }
    const { pointerId } = event;
    window.clearTimeout(pressTimer.current);
    window.clearTimeout(hideTimer.current);
    stopListening.current();
    let opened = false;
    let ownCancel: Event | undefined;
    let lateStop: number | undefined;

    const preventDefault = (e: Event) => e.preventDefault();
    // Sliding off the trigger before the threshold is not a long press, as in useLongPress.
    const move = (e: globalThis.PointerEvent) => {
      if (opened || e.pointerId !== pointerId) return;
      const box = trigger.getBoundingClientRect();
      const inside =
        e.clientX >= box.left &&
        e.clientX <= box.right &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom;
      if (!inside) window.clearTimeout(pressTimer.current);
    };
    const end = (e: globalThis.PointerEvent) => {
      // Only the finger's own events end it, not the pointercancel dispatched below.
      if (e === ownCancel || e.pointerId !== pointerId) return;
      window.clearTimeout(pressTimer.current);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      if (opened) {
        hideTimer.current = window.setTimeout(() => {
          latestSetOpen.current(false);
          if (closeTouchTooltip === close) closeTouchTooltip = undefined;
        }, TOUCH_HIDE_MS);
        lateStop = window.setTimeout(stop, AFTER_LIFT_MS);
      } else {
        stop();
      }
    };
    const stop = () => {
      window.clearTimeout(lateStop);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      trigger.removeEventListener("contextmenu", preventDefault);
      trigger.removeEventListener("click", preventDefault);
      if (stopListening.current === stop) stopListening.current = () => {};
    };
    stopListening.current = stop;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    // The touch's own context menu (Android) and callout must not open over the tooltip.
    trigger.addEventListener("contextmenu", preventDefault);

    pressTimer.current = window.setTimeout(() => {
      opened = true;
      trigger.addEventListener("click", preventDefault);
      // Cancels the press the trigger's own handler is tracking, so lifting the finger
      // does not press the button (React Aria's useLongPress does the same).
      ownCancel = new window.PointerEvent("pointercancel", {
        bubbles: true,
        pointerId,
      });
      target.dispatchEvent(ownCancel);
      if (closeTouchTooltip !== close) closeTouchTooltip?.();
      closeTouchTooltip = close;
      latestSetOpen.current(true);
    }, LONG_PRESS_MS);
  };

  return (
    <AriaTooltipTrigger {...props} isOpen={open} onOpenChange={setOpen}>
      <span
        className={styles.touchTarget}
        onPointerDownCapture={onPointerDownCapture}
      >
        {children}
      </span>
    </AriaTooltipTrigger>
  );
}

export interface TooltipProps extends Pick<AriaTooltipProps, "placement"> {
  /** A few words: what the button it describes does. */
  children: ReactNode;
}

/** The short label of an icon-only button (design-spec 4.5). */
export function Tooltip({ placement = "top", children }: TooltipProps) {
  return (
    <AriaTooltip placement={placement} className={styles.tooltip}>
      {children}
    </AriaTooltip>
  );
}
