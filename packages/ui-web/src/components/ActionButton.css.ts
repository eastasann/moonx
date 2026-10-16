import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";
import { atLeastTarget, focusRing, hoverTransition } from "../styles/helpers";

const sizes = ["S", "M", "L", "XL"] as const;

const sized = <T>(make: (size: (typeof sizes)[number]) => T) =>
  Object.fromEntries(sizes.map((size) => [size, make(size)])) as Record<
    (typeof sizes)[number],
    T
  >;

/**
 * ActionButton, and the buttons of ToggleButtonGroup: tools that act on the screen, not
 * its main action. Selected toggles take the ink fill, as SegmentedControl's choice does
 * (06 color.control.primary).
 */
export const actionButton = recipe({
  base: {
    ...hoverTransition,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.space["100"],
    margin: 0,
    border: `${vars.borderWidth.strong} solid ${vars.color.border.strong}`,
    borderRadius: vars.radius.control,
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
      "&[data-selected]": {
        background: vars.color.control.primary,
        borderColor: vars.color.control.primary,
        color: vars.color.control.onPrimary,
      },
      "&[data-selected][data-hovered]": {
        background: vars.color.control.primaryHover,
      },
      "&[data-selected][data-pressed]": {
        background: vars.color.control.primaryPressed,
      },
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
    isQuiet: {
      true: {
        background: "transparent",
        borderColor: "transparent",
        color: vars.color.text.primary,
        selectors: {
          "&[data-hovered]": { background: vars.color.surface.hover },
        },
      },
      false: {},
    },
    size: sized((size) => ({
      minHeight: atLeastTarget(vars.scale.component.actionButton.height[size]),
      minWidth: atLeastTarget(vars.scale.component.actionButton.height[size]),
      paddingInline: vars.scale.component.actionButton.paddingX[size],
      fontSize: vars.scale.component.button.fontSize[size],
    })),
    iconOnly: {
      true: {},
      false: {},
    },
  },
  compoundVariants: sizes.map((size) => ({
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
