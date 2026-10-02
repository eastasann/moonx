import { createContext } from "react";

/**
 * Set by the ComboBox tray around its list. A tray list is `selectionMode="single"` so React Aria
 * reports `aria-selected`, but React Aria does not run an item's action when it is already
 * selected, so each item closes the tray through its press handler instead.
 */
export const TrayChoiceContext = createContext<((id: string) => void) | null>(null);
