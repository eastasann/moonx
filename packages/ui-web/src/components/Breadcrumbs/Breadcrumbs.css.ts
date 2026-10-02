import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { breakpoints, vars } from "../../theme";
import { hitAreaSelectors } from "../_internal/target";

export const breadcrumbs = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  margin: 0,
  padding: 0,
  listStyle: "none",
  fontFamily: vars.typography["body-sm"].fontFamily,
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
  // Mobile shows a back link instead (design-spec 4.5); the screen renders that link itself.
  "@media": { [`(max-width: ${breakpoints.tablet - 1}px)`]: { display: "none" } },
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

export const separator = style({
  flexShrink: 0,
  width: vars.scale.component.icon.size.XS,
  height: vars.scale.component.icon.size.XS,
  color: vars.color.text.secondary,
  strokeWidth: vars.icon["stroke-width"],
  selectors: { "&:dir(rtl)": { transform: "scaleX(-1)" } },
});
