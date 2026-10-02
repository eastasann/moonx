import { keyframes } from "@vanilla-extract/css";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

const pulse = keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

/**
 * The pulse is decoration on top of a placeholder shape that already says "loading", so it stops
 * under reduced motion. The spinner and the indeterminate bar keep moving because their motion is
 * the signal itself.
 */
export const skeleton = recipe({
  base: {
    display: "block",
    background: vars.color.control.track,
    animation: `${pulse} ${vars.motion.loop.pulse} ease-in-out infinite`,
    "@media": { [reducedMotion]: { animation: "none" } },
  },
  variants: {
    shape: {
      text: { height: vars.typography.body.fontSize, borderRadius: vars.radius.chip },
      block: { borderRadius: vars.radius.card },
      circle: {
        width: vars.scale.component.avatar.size.M,
        height: vars.scale.component.avatar.size.M,
        borderRadius: vars.radius.pill,
      },
    },
  },
  defaultVariants: { shape: "text" },
});

export type SkeletonVariants = NonNullable<RecipeVariants<typeof skeleton>>;
