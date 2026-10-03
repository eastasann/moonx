import { UnistylesRuntime } from "react-native-unistyles";

export type ThemePreference = "system" | "light" | "dark";

/**
 * Applies the account setting System / Light / Dark (design-spec 4). `system` goes back to the
 * OS color scheme; the other two pin a theme and stop following the OS.
 */
export function setThemePreference(preference: ThemePreference): void {
  if (preference === "system") {
    UnistylesRuntime.setAdaptiveThemes(true);
    return;
  }
  UnistylesRuntime.setAdaptiveThemes(false);
  UnistylesRuntime.setTheme(preference);
}
