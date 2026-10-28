import type { ReactNode } from "react";
import { PopoverContext } from "react-aria-components";
import { AnswerFieldContext } from "./answerField";
import { ListPaneContext } from "./frame";
import { BottomBarContext, FieldWidthContext } from "./size";

/**
 * What a place passes to the parts in it stops at an overlay: a dialog, popover or tray
 * opened from a phone's bottom bar, a settings group, a question's answer or a list's pane
 * draws its parts as anywhere else (no XL buttons sharing the width, full-width fields,
 * the answer's look or the pane's rows). React passes context through portals, so each
 * overlay puts these back. The trigger's popover context stops too, as React Aria's
 * Popover stops it: a Picker inside reads none in the hidden render of its items, where
 * ResponsivePopover then draws no tray.
 */
export function OverlayContexts({ children }: { children: ReactNode }) {
  return (
    <PopoverContext.Provider value={null}>
      <BottomBarContext.Provider value={false}>
        <FieldWidthContext.Provider value="default">
          <AnswerFieldContext.Provider value={false}>
            <ListPaneContext.Provider value={false}>
              {children}
            </ListPaneContext.Provider>
          </AnswerFieldContext.Provider>
        </FieldWidthContext.Provider>
      </BottomBarContext.Provider>
    </PopoverContext.Provider>
  );
}
