import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { atLeastTarget } from "../_internal/target";

const hairline = `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`;

function byDensity<T>(make: (d: "compact" | "regular" | "spacious") => T) {
  return { compact: make("compact"), regular: make("regular"), spacious: make("spacious") };
}

export const list = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    color: vars.color.text.primary,
    fontFamily: vars.typography.body.fontFamily,
    fontSize: vars.typography.body.fontSize,
    lineHeight: vars.typography.body.lineHeight,
    outline: "none",
    selectors: { "&[data-focus-visible]": focusRing },
  },
  variants: { density: byDensity((d) => ({ gap: vars.density[d]["list-gap"] })) },
  defaultVariants: { density: "regular" },
});

export const item = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: vars.space["200"],
    background: vars.color.surface.raised,
    border: hairline,
    borderRadius: vars.radius.control,
    cursor: "default",
    outline: "none",
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-hovered]": { background: vars.color.surface.hover },
      "&[data-pressed]": { background: vars.color.surface.hover },
      "&[data-selected]": { background: vars.color.surface.selected },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
      "&[data-href]": { cursor: "pointer" },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    density: byDensity((d) => ({
      minHeight: atLeastTarget(vars.density[d]["row-height"]),
      paddingInline: vars.density[d]["cell-padding-x"],
      paddingBlock: vars.density[d]["cell-padding-y"],
    })),
  },
  defaultVariants: { density: "regular" },
});

export const itemContent = style({ flex: 1, minWidth: 0 });

export const checkbox = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  outline: "none",
  minWidth: vars.scale.component["target-min"],
  minHeight: vars.scale.component["target-min"],
});

export const checkboxBox = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: vars.scale.component.checkbox["control-size"].M,
  height: vars.scale.component.checkbox["control-size"].M,
  border: `${vars["border-width"].strong} solid ${vars.color.border.strong}`,
  borderRadius: vars.radius.chip,
  background: vars.color.surface.raised,
  color: vars.color.control["on-primary"],
  selectors: {
    [`${checkbox}[data-selected] &`]: {
      background: vars.color.control.primary,
      borderColor: vars.color.control.primary,
    },
    [`${checkbox}[data-focus-visible] &`]: focusRing,
    [`${checkbox}[data-disabled] &`]: {
      background: vars.color.control.disabled,
      borderColor: vars.color.border.hairline,
    },
  },
});

export const checkboxIcon = style({
  width: vars.scale.component.icon.size.XS,
  height: vars.scale.component.icon.size.XS,
});

export const empty = style({
  padding: vars.space["400"],
  textAlign: "center",
  color: vars.color.text.secondary,
});
