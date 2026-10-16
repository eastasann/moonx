import { vars } from "@moonx/ui-tokens";
import { styleVariants } from "@vanilla-extract/css";

/**
 * Lucide icon sizes (06 scale.*.component.icon). CSS outranks the width, height and
 * stroke-width attributes Lucide writes, so the scale tokens decide.
 */
export const iconSize = styleVariants(
  vars.scale.component.icon.size,
  (size) => ({
    width: size,
    height: size,
    flexShrink: 0,
    strokeWidth: vars.icon.strokeWidth,
  }),
);
