import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { globalStyle } from "@vanilla-extract/css";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { sizeVariants } from "../_internal/sizes";
import { atLeastTarget } from "../_internal/target";

const actionButtonTokens = vars.scale.component["action-button"];

export const actionButton = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.space["75"],
    border: "none",
    borderRadius: vars.radius.control,
    fontFamily: vars.typography.button.fontFamily,
    fontWeight: vars.typography.button.fontWeight,
    lineHeight: vars.typography.button.lineHeight,
    cursor: "pointer",
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        background: "transparent",
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    quiet: {
      false: {
        background: vars.color.control.secondary,
        color: vars.color.control["on-secondary"],
        selectors: {
          "&[data-hovered]": { background: vars.color.control["secondary-hover"] },
          "&[data-pressed]": { background: vars.color.control["secondary-pressed"] },
          "&[data-selected]": {
            background: vars.color.control.primary,
            color: vars.color.control["on-primary"],
          },
          "&[data-selected][data-hovered]": { background: vars.color.control["primary-hover"] },
          "&[data-selected][data-pressed]": { background: vars.color.control["primary-pressed"] },
          "&[data-disabled]": { background: vars.color.control.disabled },
        },
      },
      true: {
        background: "transparent",
        color: vars.color.text.primary,
        selectors: {
          "&[data-hovered]": { background: vars.color.surface.hover },
          "&[data-pressed]": { background: vars.color.control.secondary },
          "&[data-selected]": { background: vars.color.surface.selected },
        },
      },
    },
    iconOnly: { true: {}, false: {} },
    size: sizeVariants((s) => ({
      minHeight: atLeastTarget(actionButtonTokens.height[s]),
      fontSize: vars.scale.component.button["font-size"][s],
    })),
  },
  compoundVariants: [
    ...(["S", "M", "L", "XL"] as const).flatMap((s) => [
      {
        variants: { size: s, iconOnly: false },
        style: { paddingInline: actionButtonTokens["padding-x"][s] },
      },
      {
        variants: { size: s, iconOnly: true },
        style: {
          padding: actionButtonTokens["padding-icon-only"][s],
          minWidth: atLeastTarget(actionButtonTokens.height[s]),
        },
      },
    ]),
  ],
  defaultVariants: { size: "M", quiet: false, iconOnly: false },
});

export type ActionButtonVariants = NonNullable<RecipeVariants<typeof actionButton>>;

export const iconSlot = recipe({
  base: { display: "inline-flex", flexShrink: 0 },
  variants: { size: sizeVariants(() => ({})) },
  defaultVariants: { size: "M" },
});

for (const size of COMPONENT_SIZES) {
  globalStyle(`${iconSlot.classNames.variants.size[size]} svg`, {
    inlineSize: vars.scale.component.icon.size[size],
    blockSize: vars.scale.component.icon.size[size],
    strokeWidth: vars.icon["stroke-width"],
  });
}
