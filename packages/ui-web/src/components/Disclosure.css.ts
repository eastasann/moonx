import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  reducedMotion,
} from "../styles/helpers";

const sized = Object.fromEntries(sizes.map((size) => [size, size])) as Record<
  Size,
  Size
>;

/**
 * Regular disclosures are rows between hairlines, as an Accordion's are (4.4: dividers,
 * not boxes). Quiet ones sit inline with no line ("▸ EXAMPLE  ▸ Hint", design-spec 6.2).
 */
export const disclosure = recipe({
  base: { minWidth: 0 },
  variants: {
    isQuiet: {
      false: {
        borderBlock: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
        selectors: { "& + &": { borderBlockStart: "none" } },
      },
      true: {},
    },
  },
  defaultVariants: { isQuiet: false },
});

export const heading = style({ margin: 0, display: "flex" });

export const trigger = recipe({
  base: {
    ...hoverTransition,
    display: "flex",
    alignItems: "center",
    gap: vars.space["100"],
    margin: 0,
    border: "none",
    borderRadius: vars.radius.control,
    background: "transparent",
    // The title in secondary at the medium weight (s11-form.html .discl summary).
    color: vars.color.text.secondary,
    fontFamily: vars.typography.label.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: vars.typography.label.lineHeight,
    textAlign: "start",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
    selectors: {
      "&[data-hovered]": { background: vars.color.surface.hover },
      "&[data-pressed]": { background: vars.color.control.secondaryPressed },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
  },
  variants: {
    isQuiet: {
      false: { flex: "1 1 auto" },
      true: {},
    },
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          minHeight: atLeastTarget(
            vars.scale.component.disclosure.titleHeight[size],
          ),
          paddingInline: vars.scale.component.disclosure.titlePaddingX[size],
          fontSize: vars.scale.component.disclosure.titleFontSize[size],
        },
      ]),
    ) as Record<
      Size,
      { minHeight: string; paddingInline: string; fontSize: string }
    >,
  },
  defaultVariants: { isQuiet: false, size: "M" },
});

/** The chevron points down while open; it turns without motion when motion is reduced. */
export const chevron = recipe({
  base: {
    display: "inline-flex",
    flexShrink: 0,
    transitionProperty: "transform",
    transitionDuration: vars.motion.transition.expand.duration,
    transitionTimingFunction: vars.motion.transition.expand.timingFunction,
    "@media": { [reducedMotion]: { transitionDuration: "0s" } },
  },
  variants: {
    isExpanded: {
      true: { transform: "rotate(90deg)" },
      false: {},
    },
  },
});

/**
 * React Aria writes the panel's height into --disclosure-panel-height while it opens and
 * closes, so the height eases (06 motion.transition.expand).
 */
export const panel = style({
  height: "var(--disclosure-panel-height)",
  overflow: "clip",
  transitionProperty: "height",
  transitionDuration: vars.motion.transition.expand.duration,
  transitionTimingFunction: vars.motion.transition.expand.timingFunction,
  "@media": { [reducedMotion]: { transitionDuration: "0s" } },
});

/**
 * The content starts under the title's text, past the chevron (s11-form.html .discl
 * .body), and keeps Spectrum's end padding.
 */
export const panelInner = styleVariants(sized, (size) => ({
  paddingBlockStart: vars.space["100"],
  paddingBlockEnd: vars.space["300"],
  paddingInlineStart: `calc(${vars.scale.component.disclosure.titlePaddingX[size]} + ${vars.scale.component.icon.size[size]} + ${vars.space["100"]})`,
  paddingInlineEnd: vars.scale.component.disclosure.panelPaddingX[size],
}));

export const accordion = style({ display: "flex", flexDirection: "column" });
