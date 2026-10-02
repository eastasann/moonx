import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

/** The modal sheets of design-spec 3.8, opened by `?modal=` (SDD 4). */
export const MODALS = [
  "new-idea",
  "evidence",
  "save-version",
  "go-no-go",
  "create-plan",
  "share",
  "switch-workspace",
  "update-template",
] as const;
export type ModalName = (typeof MODALS)[number];

export const PANELS = ["comments", "history"] as const;
export type PanelName = (typeof PANELS)[number];

/**
 * Search parameters every route accepts. A value that is not one of the names (an old or typed
 * link) is dropped instead of failing the page.
 */
export const overlaySearchSchema = z.object({
  modal: z.enum(MODALS).optional().catch(undefined),
  panel: z.enum(PANELS).optional().catch(undefined),
  target: z.string().optional().catch(undefined),
  about: z.string().optional().catch(undefined),
});

type OverlaySearch = z.infer<typeof overlaySearchSchema>;

/** Reads and changes the modal and the panel of the current URL without leaving the screen. */
export function useOverlay() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as OverlaySearch;
  const update = (patch: OverlaySearch) =>
    navigate({
      search: ((previous: Record<string, unknown>) => ({ ...previous, ...patch })) as never,
    });
  return {
    modal: search.modal,
    panel: search.panel,
    target: search.target,
    /** The item a sheet is about (M2: `<targetType>:<targetId>[:<targetKey>]`). */
    about: search.about,
    /** `about` names what a sheet is about. It is separate from `target`, which belongs to the panel beside it. */
    openModal: (modal: ModalName, about?: string) => update({ modal, ...(about ? { about } : {}) }),
    closeModal: () => update({ modal: undefined, about: undefined }),
    openPanel: (panel: PanelName, target: string) => update({ panel, target }),
    closePanel: () => update({ panel: undefined, target: undefined }),
  };
}
