import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { breakpoints, vars } from "../../theme";
import { sizeVariants } from "../_internal/sizes";
import { hitAreaSelectors } from "../_internal/target";

const SEPARATOR_ICON = { S: "XS", M: "XS", L: "S", XL: "M" } as const;

export const breadcrumbs = recipe({
  base: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontFamily: vars.typography["body-sm"].fontFamily,
    lineHeight: vars.typography["body-sm"].lineHeight,
    // Mobile shows a back link instead (design-spec 4.5); the screen renders that link itself.
    "@media": { [`(max-width: ${breakpoints.tablet - 1}px)`]: { display: "none" } },
  },
  variants: {
    size: sizeVariants((s) => ({ fontSize: vars.scale.component.field["font-size"][s] })),
  },
  defaultVariants: { size: "M" },
});

export const breadcrumb = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["100"],
  minWidth: 0,
  marginInlineEnd: vars.space["100"],
});

export const link = style({
  position: "relative",
  color: vars.color.text.link,
  textDecoration: "none",
  borderRadius: vars.radius.chip,
  outline: "none",
  transition: `color ${vars.motion.transition.hover}`,
  selectors: {
    ...hitAreaSelectors,
    "&[data-hovered]": { textDecoration: "underline" },
    "&[data-focus-visible]": focusRing,
    '&[aria-current="page"]': {
      color: vars.color.text.primary,
      fontWeight: vars.typography.label.fontWeight,
    },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const separator = recipe({
  base: {
    flexShrink: 0,
    color: vars.color.text.secondary,
    strokeWidth: vars.icon["stroke-width"],
    selectors: { "&:dir(rtl)": { transform: "scaleX(-1)" } },
  },
  variants: {
    // One step below the text so the chevron stays a separator and not a glyph of its own.
    size: sizeVariants((s) => {
      const icon = vars.scale.component.icon.size[SEPARATOR_ICON[s]];
      return { width: icon, height: icon };
    }),
  },
  defaultVariants: { size: "M" },
});
