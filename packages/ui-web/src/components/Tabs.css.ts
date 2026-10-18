import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { focusRing, hoverTransition, typography } from "../styles/helpers";

const sized = Object.fromEntries(sizes.map((size) => [size, size])) as Record<
  Size,
  Size
>;

export const tabs = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});

/**
 * The row of tabs over a hairline. It scrolls sideways when the tabs do not fit, on a
 * phone above all (design-spec 4.5), so the page itself never does (4.3).
 */
export const tabList = style({
  display: "flex",
  gap: vars.space["300"],
  overflowX: "auto",
  // Scrolling sideways would let it scroll up and down too; nothing is taller than it.
  overflowY: "hidden",
  overscrollBehaviorX: "contain",
  scrollbarWidth: "none",
  // The hairline is drawn inside, so the current tab's line covers it without spilling
  // out of the scroll box and being clipped.
  boxShadow: `inset 0 calc(-1 * ${vars.borderWidth.hairline}) 0 0 ${vars.color.border.hairline}`,
  outline: "none",
});

const tab = style({
  ...hoverTransition,
  ...typography("label"),
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  justifyContent: "center",
  gap: vars.space["100"],
  minWidth: vars.scale.component.targetMin,
  paddingInline: vars.space["75"],
  color: vars.color.text.secondary,
  whiteSpace: "nowrap",
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-hovered]": { color: vars.color.text.primary },
    "&[data-selected]": { color: vars.color.text.primary },
    // The current tab's line, as the current navigation's (06 border-width.selected-indicator).
    "&[data-selected]::after": {
      content: '""',
      position: "absolute",
      insetInline: 0,
      bottom: 0,
      height: vars.borderWidth.selectedIndicator,
      background: vars.color.control.primary,
    },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
      borderRadius: vars.radius.control,
    },
    "&[data-disabled]": {
      color: vars.color.text.disabled,
      cursor: "not-allowed",
    },
  },
});

/** Tab heights by size (06 component.tabs.item-height); every one is past target-min. */
export const tabSize = styleVariants(sized, (size) => [
  tab,
  { minHeight: vars.scale.component.tabs.itemHeight[size] },
]);

export const tabPanel = style({
  paddingBlockStart: vars.space["300"],
  outline: "none",
  selectors: { "&[data-focus-visible]": focusRing },
});
