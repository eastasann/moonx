import {
  CHECK_VARIANTS,
  FAU_VARIANTS,
  STATUS_VARIANTS,
  type StatusLightVariant,
} from "@moonx/ui-tokens";
import type { Theme } from "@moonx/ui-tokens/native";

/**
 * The dot color of every StatusLight variant. Meter segments and CheckDots reuse it so every
 * part that shows a state draws the same color for it.
 */
export function strongColors(theme: Theme): Record<StatusLightVariant, string> {
  return {
    ...Object.fromEntries(STATUS_VARIANTS.map((v) => [v, theme.color[v].strong])),
    ...Object.fromEntries(FAU_VARIANTS.map((v) => [v, theme.color.fau[v].strong])),
    ...Object.fromEntries(CHECK_VARIANTS.map((v) => [v, theme.color.check[v].strong])),
  } as Record<StatusLightVariant, string>;
}
