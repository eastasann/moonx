import { breakpoints } from "@moonx/ui-tokens/native";
import { useWindowDimensions } from "react-native";

/**
 * True while the window is narrower than `semantic.breakpoint.tablet`. Same name and meaning as
 * the Web hook, so parts that switch layout at the tray width share one rule.
 */
export function useIsNarrow(): boolean {
  return useWindowDimensions().width < breakpoints.tablet;
}
