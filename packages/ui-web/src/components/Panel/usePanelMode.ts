import { useSyncExternalStore } from "react";
import { breakpoints } from "../../theme";

export type PanelMode = "side" | "overlay" | "tray";

const DESKTOP = `(min-width: ${breakpoints.desktop}px)`;
const TABLET = `(min-width: ${breakpoints.tablet}px)`;

function subscribe(onChange: () => void) {
  const lists = [window.matchMedia(DESKTOP), window.matchMedia(TABLET)];
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

function snapshot(): PanelMode {
  if (window.matchMedia(DESKTOP).matches) return "side";
  return window.matchMedia(TABLET).matches ? "overlay" : "tray";
}

/** Desktop shows a fixed side panel, tablet an overlay drawer, phone widths a tray (design-spec 4.3). */
export function usePanelMode(): PanelMode {
  return useSyncExternalStore(subscribe, snapshot, () => "side");
}
