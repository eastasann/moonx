import type { SaveState } from "@moonx/ui-tokens";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type Autosave,
  type AutosaveState,
  type SaveItem,
  saveStateOf,
} from "./autosave";

const AutosaveContext = createContext<Autosave | null>(null);

/**
 * Makes the page's saves (ADR-021) available to the screens, follows the browser going
 * offline and back, and asks before the page is closed or reloaded while input is not
 * saved: a move inside the app does not ask (design-spec 6.0.2).
 */
export function AutosaveProvider({
  autosave,
  children,
}: {
  autosave: Autosave;
  children: ReactNode;
}) {
  useEffect(() => autosave.start(), [autosave]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosave.hasUnsaved()) return;
      event.preventDefault();
      // Older browsers ask only when this is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [autosave]);
  return (
    <AutosaveContext.Provider value={autosave}>
      {children}
    </AutosaveContext.Provider>
  );
}

/**
 * The page's saves.
 *
 * @throws {Error} outside AutosaveProvider.
 */
export function useAutosave(): Autosave {
  const autosave = useContext(AutosaveContext);
  if (autosave === null) throw new Error("useAutosave outside its provider");
  return autosave;
}

const noSubscription = () => () => {};

/** The saves' state, or null where no provider is (a part rendered alone in a test). */
export function useAutosaveState(): AutosaveState | null {
  const autosave = useContext(AutosaveContext);
  return useSyncExternalStore(
    autosave?.subscribe ?? noSubscription,
    () => autosave?.getState() ?? null,
    () => autosave?.getState() ?? null,
  );
}

/** Where one item's save stands, while the page holds it. */
export function useSaveItem(key: string): SaveItem | undefined {
  return useAutosaveState()?.items.get(key);
}

/**
 * The header's save state of a screen whose items' keys start with `scope`
 * (design-spec 6.0.1・6.0.2). "Saved" counts from when the screen opened.
 */
export function useSaveState(scope?: string): SaveState | undefined {
  const state = useAutosaveState();
  const [since] = useState(() => Date.now());
  return state === null ? undefined : saveStateOf(state, scope, since);
}
