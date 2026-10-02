import type { ComponentType } from "react";
import { type ModalName, useOverlay } from "../lib/overlay";
import { SwitchWorkspaceDialog } from "./SwitchWorkspaceDialog";

/**
 * The modals that exist so far. A modal of design-spec 3.8 is added here by the step that builds
 * it; until then its `?modal=` name opens nothing.
 */
const MODALS: Partial<Record<ModalName, ComponentType>> = {
  "switch-workspace": SwitchWorkspaceDialog,
};

/** Shows the modal named by `?modal=` over the current screen. */
export function ModalHost() {
  const { modal } = useOverlay();
  const Modal = modal ? MODALS[modal] : undefined;
  return Modal ? <Modal /> : null;
}
