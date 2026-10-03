import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing } from "../../styles.css";
import { vars } from "../../theme";
import { sizeVariants } from "../_internal/sizes";
import { atLeastTarget } from "../_internal/target";

const insetFocusRing = {
  ...focusRing,
  outlineOffset: `calc(${vars["border-width"]["focus-ring"]} * -1)`,
} as const;

export const menu = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: vars.space["75"],
  outline: "none",
  fontFamily: vars.typography.body.fontFamily,
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
  color: vars.color.text.primary,
});

export const item = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: vars.space["100"],
    borderRadius: vars.radius.control,
    cursor: "pointer",
    outline: "none",
    selectors: {
      "&[data-focused]": { background: vars.color.surface.hover },
      "&[data-pressed]": { background: vars.color.surface.sunken },
      "&[data-focus-visible]": insetFocusRing,
      "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    },
  },
  variants: {
    variant: {
      default: { color: vars.color.text.primary },
      negative: { color: vars.color.negative.fg },
    },
    size: sizeVariants((s) => ({
      minHeight: atLeastTarget(vars.scale.component.field.height[s]),
      paddingInline: vars.scale.component.field["padding-x"][s],
      fontSize: vars.scale.component.field["font-size"][s],
    })),
  },
  defaultVariants: { variant: "default", size: "M" },
});

export const itemLabel = style({ flex: 1 });

export const check = style({
  width: vars.scale.component.icon.size.S,
  height: vars.scale.component.icon.size.S,
  strokeWidth: vars.icon["stroke-width"],
  flexShrink: 0,
});

export const sectionHeader = style({
  paddingBlock: vars.space["75"],
  paddingInline: vars.scale.component.field["padding-x"].M,
  color: vars.color.text.secondary,
  fontFamily: vars.typography["label-sm"].fontFamily,
  fontSize: vars.typography["label-sm"].fontSize,
  fontWeight: vars.typography["label-sm"].fontWeight,
  letterSpacing: vars.typography["label-sm"].letterSpacing,
  lineHeight: vars.typography["label-sm"].lineHeight,
});

export const separator = style({
  height: vars["border-width"].divider.S,
  margin: 0,
  marginBlock: vars.space["75"],
  border: "none",
  background: vars.color.border.hairline,
});
