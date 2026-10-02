import { flushSync } from "react-dom";

/**
 * Moves the focus into a table row and scrolls it into view: to its first field when it has one
 * (a new row's name, a row a link points at), else to the row itself. Rows are found by the
 * `data-key` that the table gives each of them; the keys are UUIDs, so they need no escaping.
 */
function focusTableRow(key: string): boolean {
  const row = document.querySelector<HTMLElement>(`tr[data-key="${key}"]`);
  if (!row) return false;
  const field = row.querySelector<HTMLInputElement>("input");
  // The table keeps its own focused row and puts the focus back on it once its state settles, so
  // the row takes the focus first and the field only after that has been applied.
  flushSync(() => row.focus());
  field?.focus();
  field?.select();
  (field ?? row).scrollIntoView?.({ block: "center" });
  return true;
}

/**
 * Focuses the row as soon as the table has it. The table builds its rows after the render that
 * adds them, so a row added a moment ago is not in the document yet. Returns the cancel function.
 */
export function focusTableRowWhenReady(key: string, onFocused: () => void): () => void {
  if (focusTableRow(key)) {
    onFocused();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (!focusTableRow(key)) return;
    clearTimeout(giveUp);
    observer.disconnect();
    onFocused();
  });
  // A row that never renders as a table row (the layout turned narrow meanwhile) must not keep the
  // observer running on every change of the page.
  const giveUp = setTimeout(() => observer.disconnect(), 5_000);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    clearTimeout(giveUp);
    observer.disconnect();
  };
}

/** Moves the focus into the input or text area of an element that carries `data-focus-key="<key>"`. */
export function focusKeyedField(key: string): boolean {
  const root = document.querySelector<HTMLElement>(`[data-focus-key="${key}"]`);
  const input = root?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  if (!input) return false;
  input.focus();
  input.select();
  input.scrollIntoView?.({ block: "center" });
  return true;
}
