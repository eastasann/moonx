import { breakpoints, themes } from "@moonx/ui-tokens/native";
import { StyleSheet } from "react-native-unistyles";

type AppThemes = typeof themes;
type AppBreakpoints = typeof breakpoints;

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

/**
 * Registers the generated themes. It must run before any `StyleSheet.create`, so the app entry
 * imports this module first (apps/mobile/index.ts). `adaptiveThemes` follows the OS color scheme
 * until `setThemePreference` pins one (design-spec 4.4).
 */
StyleSheet.configure({
  themes,
  breakpoints,
  settings: { adaptiveThemes: true },
});
