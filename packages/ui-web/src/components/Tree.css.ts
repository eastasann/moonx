import { type Density, densities, vars } from "@moonx/ui-tokens";
import { createVar, style, styleVariants } from "@vanilla-extract/css";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  reducedMotion,
  typography,
} from "../styles/helpers";

const rowHeight = createVar();
const padX = createVar();
const padY = createVar();

/** compact / regular / spacious (06 semantic.density; design-spec 4.4). */
export const density = styleVariants(
  Object.fromEntries(densities.map((step) => [step, step])) as Record<
    Density,
    Density
  >,
  (step) => ({
    vars: {
      [rowHeight]: vars.density[step].rowHeight,
      [padX]: vars.density[step].cellPaddingX,
      [padY]: vars.density[step].cellPaddingY,
    },
  }),
);

export const tree = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  color: vars.color.text.primary,
  outline: "none",
});

/** Items are rows divided by hairlines; the chosen one has the selected surface and line. */
export const item = style({
  ...hoverTransition,
  ...typography("body"),
  display: "flex",
  alignItems: "center",
  // A row is a target too: never lower than the scale's minimum (design-spec 4.3).
  minHeight: atLeastTarget(rowHeight),
  paddingInline: padX,
  paddingBlock: padY,
  borderBottom: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-selected]": {
      background: vars.color.surface.selected,
      boxShadow: `inset ${vars.borderWidth.selectedIndicator} 0 0 ${vars.color.control.primary}`,
    },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "default" },
  },
});

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
  minWidth: 0,
  width: "100%",
});

/** The branch's button, a full target though the arrow is small (design-spec 4.3). */
export const chevron = style({
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  width: atLeastTarget(vars.scale.component.icon.size.S),
  height: atLeastTarget(vars.scale.component.icon.size.S),
  padding: 0,
  border: "none",
  borderRadius: vars.radius.control,
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-focus-visible]": focusRing,
    "[data-expanded] &": { transform: "rotate(90deg)" },
  },
  transitionProperty: "transform",
  transitionDuration: vars.motion.transition.expand.duration,
  transitionTimingFunction: vars.motion.transition.expand.timingFunction,
  "@media": { [reducedMotion]: { transitionDuration: "0s" } },
});

/** A leaf keeps its title in line with its siblings that have an arrow. */
export const chevronSpace = style({
  flexShrink: 0,
  width: atLeastTarget(vars.scale.component.icon.size.S),
});

/** The › of an item that opens something (design-spec 4.4). */
export const opens = style({
  display: "inline-flex",
  flexShrink: 0,
  color: vars.color.text.secondary,
});

export const title = style({
  flex: 1,
  minWidth: 0,
  overflowWrap: "break-word",
});

export const empty = style({
  paddingInline: padX,
  paddingBlock: vars.space["400"],
});
