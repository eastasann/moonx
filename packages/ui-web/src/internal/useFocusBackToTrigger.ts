import { type RefObject, useCallback, useEffect, useRef } from "react";

/** Where a grid puts focus that comes back to it: its own rows and cells. */
const GRID_ITEM = '[role="row"], [role="gridcell"], [role="rowheader"]';

/**
 * Focus the grid itself placed: on a row or cell, or on the button or link a cell passes
 * its focus to (React Aria's cells hand it to their first child). Fields are left alone:
 * an action focuses them on purpose.
 */
const isGridFocus = (target: Element) =>
  target.matches(GRID_ITEM) ||
  (target.matches('button, a[href], [role="button"], [role="link"]') &&
    target.closest(GRID_ITEM) !== null);

/**
 * Gives focus back to an overlay's trigger once the overlay has closed, where React Aria
 * does not: in a collection (TableView, CardView, ListView, Tree), its grid sends focus
 * that comes back to it to the row or cell it remembers instead (design-spec 4.5: a
 * closed Popover, Menu or Dialog returns focus to the button that opened it). Call the
 * returned function as the overlay closes. The trigger takes focus when the grid next puts
 * it on one of its own rows or cells, or a cell's button; focus a dialog takes first (one
 * an action opened) waits for that dialog to give it back. Focus that lands anywhere else,
 * an input an action focused on purpose included, or a press, ends the wait, as does the
 * trigger going away.
 */
export function useFocusBackToTrigger(
  triggerRef: RefObject<HTMLElement | null>,
): () => void {
  const stopWaiting = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWaiting.current?.(), []);
  return useCallback(() => {
    stopWaiting.current?.();
    const trigger = triggerRef.current;
    const collection = trigger?.closest('[role="grid"], [role="treegrid"]');
    if (trigger == null || collection == null) return;
    const inDialog = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('[role="dialog"], [role="alertdialog"]') !== null;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (inDialog(target)) return;
      stop();
      if (
        trigger.isConnected &&
        target instanceof Element &&
        target !== trigger &&
        collection.contains(target) &&
        isGridFocus(target)
      ) {
        trigger.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!inDialog(event.target)) stop();
    };
    const stop = () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      stopWaiting.current = null;
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    stopWaiting.current = stop;
  }, [triggerRef]);
}
