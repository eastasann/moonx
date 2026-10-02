import type { ComponentType } from "react";
import { type ModalName, useOverlay } from "../lib/overlay";
import { CreatePlanDialog } from "./CreatePlanDialog";
import { GoNoGoDialog } from "./GoNoGoDialog";
import { NewIdeaDialog } from "./NewIdeaDialog";
import { SaveVersionDialog } from "./SaveVersionDialog";
import { ShareDialog } from "./ShareDialog";
import { SwitchWorkspaceDialog } from "./SwitchWorkspaceDialog";
import { UpdateTemplateDialog } from "./UpdateTemplateDialog";

/**
 * The modals that exist so far. A modal of design-spec 3.8 is added here by the step that builds
 * it; until then its `?modal=` name opens nothing.
 */
const MODALS: Partial<Record<ModalName, ComponentType>> = {
  "new-idea": NewIdeaDialog,
  "create-plan": CreatePlanDialog,
  "save-version": SaveVersionDialog,
  "go-no-go": GoNoGoDialog,
  share: ShareDialog,
  "switch-workspace": SwitchWorkspaceDialog,
  "update-template": UpdateTemplateDialog,
};

/** Shows the modal named by `?modal=` over the current screen. */
export function ModalHost() {
  const { modal } = useOverlay();
  const Modal = modal ? MODALS[modal] : undefined;
  return Modal ? <Modal /> : null;
}
