import { vars } from "@moonx/ui-tokens";
import { styleVariants } from "@vanilla-extract/css";

/**
 * Lucide icon sizes (06 scale.*.component.icon). CSS outranks the width, height and
 * stroke-width attributes Lucide writes, so the scale tokens decide.
 */
export const iconSize = styleVariants(
  // `nav`: the arrows of the phone's header and of the phone's previous and next
  // (06 layout.nav-icon-size).
  { ...vars.scale.component.icon.size, nav: vars.layout.navIconSize },
  (size) => ({
    width: size,
    height: size,
    flexShrink: 0,
    strokeWidth: vars.icon.strokeWidth,
  }),
);
