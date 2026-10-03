import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { sizeVariants } from "../_internal/sizes";
import { atLeastTarget } from "../_internal/target";

// A toggle is a row on its own, so it is one step taller than a field of the same size.
const TOGGLE_HEIGHT = { S: "M", M: "L", L: "XL", XL: "XL" } as const;

const CHEVRON_ICON = { S: "XS", M: "S", L: "M", XL: "L" } as const;

export const disclosure = style({
  borderBlockEnd: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  color: vars.color.text.primary,
  fontFamily: vars.typography.body.fontFamily,
});

export const heading = style({ margin: 0 });

export const trigger = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: vars.space["100"],
    width: "100%",
    paddingBlock: vars.space["100"],
    paddingInline: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    textAlign: "start",
    cursor: "pointer",
    fontFamily: vars.typography.label.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    letterSpacing: vars.typography.label.letterSpacing,
    lineHeight: vars.typography.label.lineHeight,
    selectors: {
      "&[data-hovered]": { color: vars.color.text.secondary },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    },
  },
  variants: {
    size: sizeVariants((s) => ({
      minHeight: atLeastTarget(vars.scale.component.field.height[TOGGLE_HEIGHT[s]]),
      fontSize: vars.scale.component.field["font-size"][s],
    })),
  },
  defaultVariants: { size: "M" },
});

export const chevron = recipe({
  base: {
    flexShrink: 0,
    strokeWidth: vars.icon["stroke-width"],
    transition: `transform ${vars.motion.transition.expand}`,
    selectors: {
      [`${disclosure}[data-expanded] &`]: { transform: "rotate(90deg)" },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => {
      const icon = vars.scale.component.icon.size[CHEVRON_ICON[s]];
      return { width: icon, height: icon };
    }),
  },
  defaultVariants: { size: "M" },
});

export const panel = style({
  overflow: "hidden",
  height: "var(--disclosure-panel-height)",
  transition: `height ${vars.motion.transition.expand}`,
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const panelContent = style({
  paddingBlockEnd: vars.space["200"],
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
});

export const accordion = style({
  borderBlockStart: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
});
