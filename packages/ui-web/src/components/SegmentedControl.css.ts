import { type SizeWithXS, sizesWithXS, vars } from "@moonx/ui-tokens";
import { globalStyle } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  narrowQuery,
} from "../styles/helpers";

/**
 * One groove (docs/mockups .seg): the canvas inside a light frame, the segments 2px
 * apart; the chosen segment takes the ink fill (06 color.control.primary). The F/A/U
 * ToggleButtonGroup uses the same groove (design-spec 4.5).
 */
export const control = recipe({
  base: {
    display: "inline-flex",
    // Its own width even where a column would stretch it; isJustified fills the line.
    width: "fit-content",
    maxWidth: "100%",
    // Never wraps, on a phone either (design-spec 4.5): where the segments do not fit a
    // phone's width, the groove scrolls sideways inside itself, as Tabs do, so the page
    // does not (4.3).
    flexWrap: "nowrap",
    "@media": {
      [narrowQuery]: {
        overflowX: "auto",
        overflowY: "hidden",
        overscrollBehaviorX: "contain",
        scrollbarWidth: "none",
      },
    },
    padding: vars.space["50"],
    gap: vars.space["50"],
    background: vars.color.surface.canvas,
    border: `${vars.borderWidth.strong} solid ${vars.color.border.default}`,
    borderRadius: vars.radius.groove,
  },
  variants: {
    isJustified: {
      true: { display: "flex", width: "100%" },
      false: {},
    },
    // ToggleButtonGroup's quiet look: the segments without the groove.
    isQuiet: {
      true: { background: "transparent", borderColor: "transparent" },
      false: {},
    },
    orientation: {
      horizontal: {},
      vertical: { flexDirection: "column", alignItems: "stretch" },
    },
  },
  defaultVariants: {
    isJustified: false,
    isQuiet: false,
    orientation: "horizontal",
  },
});

/** The XS of ToggleButtonGroup has no step of the groove's own: ActionButton's XS. */
const step = (size: SizeWithXS) =>
  size === "XS"
    ? {
        height: vars.scale.component.actionButton.height.XS,
        paddingX: vars.scale.component.actionButton.paddingX.XS,
        fontSize: vars.scale.component.actionButton.fontSize.XS,
      }
    : {
        height: vars.scale.component.segmentedControl.itemHeight[size],
        paddingX: vars.scale.component.segmentedControl.paddingX[size],
        fontSize: vars.scale.component.segmentedControl.fontSize[size],
      };

export const item = recipe({
  base: {
    ...hoverTransition,
    flex: "0 1 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.space["85"],
    margin: 0,
    border: "none",
    borderRadius: vars.radius.grooveItem,
    background: "transparent",
    color: vars.color.text.secondary,
    fontFamily: vars.typography.button.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: vars.typography.button.lineHeight,
    whiteSpace: "nowrap",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
    selectors: {
      // A groove filling the line shares it among its segments (FauPicker, 6.0.3), each
      // at least as wide as its label (s17-costs.html: flex 1 at the default min-width).
      [`${control.classNames.variants.isJustified.true} > &`]: {
        flex: "1 1 0",
      },
      "&[data-hovered]": {
        background: vars.color.surface.raised,
        color: vars.color.text.primary,
      },
      "&[data-selected]": {
        background: vars.color.control.primary,
        color: vars.color.control.onPrimary,
      },
      "&[data-selected][data-hovered]": {
        background: vars.color.control.primaryHover,
      },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
      // A disabled choice still shows which one it is: the inactive fill inside a ring
      // of the 3:1 frame, which the fill alone would not carry on the canvas.
      "&[data-selected][data-disabled]": {
        background: vars.color.control.disabled,
        boxShadow: `inset 0 0 0 ${vars.borderWidth.strong} ${vars.color.border.strong}`,
      },
    },
    "@media": {
      // The scrolling groove would clip a ring drawn outside its padding; the 2px
      // padding holds one drawn against the segment. An inset ring would vanish into the
      // chosen segment's ink fill.
      [narrowQuery]: {
        selectors: { "&[data-focus-visible]": { outlineOffset: 0 } },
      },
    },
  },
  variants: {
    // The segment's own height (06 segmented-control.item-height); the groove's padding
    // and frame sit around it. The minimum target still applies to the segment.
    size: Object.fromEntries(
      sizesWithXS.map((size) => [
        size,
        {
          minHeight: atLeastTarget(step(size).height),
          paddingInline: step(size).paddingX,
          fontSize: step(size).fontSize,
        },
      ]),
    ) as Record<
      SizeWithXS,
      { minHeight: string; paddingInline: string; fontSize: string }
    >,
  },
  defaultVariants: { size: "M" },
});

/**
 * A chosen segment takes the ink fill, so a mark inside it (F/A/U's moons, 4.5) takes the
 * segment's text colour, or a full moon would vanish into the fill; a disabled one greys
 * out with its label.
 */
globalStyle(
  `${item.classNames.base}[data-selected] svg, ${item.classNames.base}[data-disabled] svg`,
  { color: "inherit" },
);
