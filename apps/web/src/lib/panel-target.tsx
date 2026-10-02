import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

interface PanelTargetValue {
  /** `<targetType>:<targetId>[:<targetKey>]` (SDD 4), or null on a screen with nothing to comment on. */
  target: string | null;
  setTarget: (target: string | null) => void;
}

const PanelTargetContext = createContext<PanelTargetValue | null>(null);

export function PanelTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<string | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);
  return <PanelTargetContext.Provider value={value}>{children}</PanelTargetContext.Provider>;
}

/**
 * A screen with something to comment on or show the history of calls this with the item; the
 * header then offers the Comments and History entries for it. It clears when the screen goes.
 */
export function usePanelTarget(target: string | null): void {
  const context = useContext(PanelTargetContext);
  const setTarget = context?.setTarget;
  useEffect(() => {
    setTarget?.(target);
    return () => setTarget?.(null);
  }, [setTarget, target]);
}

/** The item the header's panel entries open, or null when there is none. */
export function useHeaderPanelTarget(): string | null {
  return useContext(PanelTargetContext)?.target ?? null;
}
