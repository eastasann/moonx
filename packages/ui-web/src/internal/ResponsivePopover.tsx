import { type PopoverSize, popoverMaxHeight } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import {
  Popover,
  PopoverContext,
  type PopoverProps,
  useSlottedContext,
} from "react-aria-components";
import { TraySheet } from "../components/Tray";
import { OverlayContexts } from "./OverlayContexts";
import * as styles from "./overlay.css";
import { useIsNarrow } from "./useIsNarrow";

export interface ResponsivePopoverProps
  extends Pick<PopoverProps, "placement" | "offset"> {
  /** A fixed width (06 component.popover.width); without it the popover fits its content. */
  size?: PopoverSize;
  children: ReactNode;
}

/**
 * The overlay of Popover, Menu, Picker, DatePicker and ContextualHelp: a popover on
 * tablet and wider, a tray below `semantic.breakpoint.tablet` (design-spec 4.5, ADR-025).
 * Put it where React Aria expects a `Popover`; both forms take the open state from the
 * surrounding trigger.
 */
export function ResponsivePopover({
  size,
  children,
  ...popoverProps
}: ResponsivePopoverProps) {
  const isNarrow = useIsNarrow();
  const context = useSlottedContext(PopoverContext);
  // The two forms' Popovers have their own keys: React would otherwise keep the one
  // instance across the breakpoint and turn its open state from the trigger's into a
  // fixed one, which React Aria warns about.
  if (!isNarrow) {
    return (
      <Popover
        key="popover"
        {...popoverProps}
        maxHeight={popoverMaxHeight}
        className={`${styles.popover} ${size === undefined ? "" : styles.popoverWidth[size]}`}
      >
        <OverlayContexts>{children}</OverlayContexts>
      </Popover>
    );
  }
  // The tray is not a Popover, so it clears the parent's contexts the way Popover does:
  // otherwise a Button inside would take the trigger's props.
  let content = <OverlayContexts>{children}</OverlayContexts>;
  for (const Context of context?.clearContexts ?? []) {
    content = <Context.Provider value={null}>{content}</Context.Provider>;
  }
  return (
    <>
      {/* React Aria builds a Picker's items in a hidden render that only Popover passes
          through to its children; closed, this one renders nothing on the page. */}
      <Popover key="collection" isOpen={false}>
        {children}
      </Popover>
      <TraySheet>{content}</TraySheet>
    </>
  );
}
