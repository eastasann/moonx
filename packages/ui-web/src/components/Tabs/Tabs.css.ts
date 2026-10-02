import { createVar, style } from "@vanilla-extract/css";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

const itemHeight = createVar();

export const tabs = recipe({
  base: { display: "flex", flexDirection: "column", minWidth: 0 },
  variants: {
    size: {
      S: { vars: { [itemHeight]: vars.scale.component.tabs["item-height"].S } },
      M: { vars: { [itemHeight]: vars.scale.component.tabs["item-height"].M } },
      L: { vars: { [itemHeight]: vars.scale.component.tabs["item-height"].L } },
      XL: { vars: { [itemHeight]: vars.scale.component.tabs["item-height"].XL } },
    },
  },
  defaultVariants: { size: "M" },
});

/** Scrolls sideways when the tabs do not fit; the focus ring is drawn inside to avoid clipping. */
export const tabList = style({
  display: "flex",
  overflowX: "auto",
  overscrollBehaviorX: "contain",
  scrollbarWidth: "thin",
  borderBlockEnd: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
});

export const tab = style({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  height: itemHeight,
  paddingInline: vars.space["300"],
  color: vars.color.text.secondary,
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.typography.label.fontSize,
  fontWeight: vars.typography.label.fontWeight,
  whiteSpace: "nowrap",
  cursor: "pointer",
  outline: "none",
  transition: `color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { color: vars.color.text.primary },
    "&[data-selected]": {
      color: vars.color.text.primary,
      boxShadow: `inset 0 calc(${vars["border-width"].divider.M} * -1) 0 0 ${vars.color.control["track-fill"]}`,
    },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(${vars["border-width"]["focus-ring"]} * -1)`,
    },
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const tabPanel = style({
  paddingBlockStart: vars.space["300"],
  outline: "none",
  selectors: { "&[data-focus-visible]": focusRing },
});

export type TabsVariants = NonNullable<RecipeVariants<typeof tabs>>;
