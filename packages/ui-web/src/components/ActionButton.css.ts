import { type SizeWithXS, sizesWithXS, vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";
import { atLeastTarget, focusRing, hoverTransition } from "../styles/helpers";

// XS is for the components whose steps start at XS (ActionMenu, ContextualHelp);
// ActionButton's own prop starts at S (design-spec 4.5).
const sized = <T>(make: (size: SizeWithXS) => T) =>
  Object.fromEntries(sizesWithXS.map((size) => [size, make(size)])) as Record<
    SizeWithXS,
    T
  >;

/** ActionButton: tools that act on the screen, not its main action. */
export const actionButton = recipe({
  base: {
    ...hoverTransition,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.space["100"],
    margin: 0,
    // Its text or its tooltip names it, so its frame is the light one (06 border.default).
    border: `${vars.borderWidth.strong} solid ${vars.color.border.default}`,
    background: vars.color.control.secondary,
    color: vars.color.control.onSecondary,
    fontFamily: vars.typography.button.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: vars.typography.button.lineHeight,
    whiteSpace: "nowrap",
    cursor: "pointer",
    outline: "none",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    selectors: {
      "&[data-hovered]": { background: vars.color.control.secondaryHover },
      "&[data-pressed]": { background: vars.color.control.secondaryPressed },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        background: vars.color.control.disabled,
        borderColor: "transparent",
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
  },
  variants: {
    // The header's tools (💬・🕘・⋯): secondary until hovered (moon-base.css .iconbtn).
    isQuiet: {
      true: {
        background: "transparent",
        borderColor: "transparent",
        color: vars.color.text.secondary,
        selectors: {
          "&[data-hovered]": {
            background: vars.color.surface.hover,
            color: vars.color.text.primary,
          },
          // A quiet button stays unfilled when it cannot be pressed (s09's last Owner's ⋯).
          "&[data-disabled]": { background: "transparent" },
        },
      },
      false: {},
    },
    size: sized((size) => ({
      minHeight: atLeastTarget(vars.scale.component.actionButton.height[size]),
      minWidth: atLeastTarget(vars.scale.component.actionButton.height[size]),
      paddingInline: vars.scale.component.actionButton.paddingX[size],
      fontSize: vars.scale.component.actionButton.fontSize[size],
      borderRadius: vars.scale.component.actionButton.radius[size],
    })),
    iconOnly: {
      true: {},
      false: {},
    },
  },
  compoundVariants: sizesWithXS.map((size) => ({
    variants: { iconOnly: true, size },
    style: {
      paddingInline: vars.scale.component.actionButton.paddingIconOnly[size],
    },
  })),
  defaultVariants: { isQuiet: false, size: "M", iconOnly: false },
});

export const group = recipe({
  base: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    minWidth: 0,
  },
  variants: {
    orientation: {
      horizontal: {},
      vertical: { flexDirection: "column", alignItems: "stretch" },
    },
    density: {
      compact: { gap: vars.space["50"] },
      regular: { gap: vars.space["100"] },
    },
  },
  defaultVariants: { orientation: "horizontal", density: "regular" },
});
