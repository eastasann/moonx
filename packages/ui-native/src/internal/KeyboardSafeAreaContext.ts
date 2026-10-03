import { createContext } from "react";

/**
 * Given by `KeyboardSafeArea` to the inputs inside it. `reveal` scrolls the focused input out
 * from under the keyboard; it matters when focus moves between inputs while the keyboard stays
 * up, because no keyboard event fires then.
 */
interface KeyboardSafeAreaContextValue {
  reveal: () => void;
}

export const KeyboardSafeAreaContext = createContext<KeyboardSafeAreaContextValue | null>(null);
