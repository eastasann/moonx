import { fontFamily, type Theme } from "@moonx/ui-tokens/native";
import { Platform, type TextStyle } from "react-native";

/**
 * Turns a `semantic.typography` entry into a React Native text style. `fontRole` picks the
 * family: `display` is the display face, `body` keeps the OS sans-serif (which also covers
 * Japanese and Tagalog, design-spec 4.4), `mono` is per platform.
 */
export type FontStyle = Pick<
  TextStyle,
  "fontSize" | "fontWeight" | "letterSpacing" | "lineHeight" | "fontFamily" | "fontVariant"
>;

export function fontStyle(theme: Theme, name: keyof Theme["typography"]): FontStyle {
  const entry = theme.typography[name] as {
    fontRole: "display" | "body" | "mono";
    fontSize: number;
    fontWeight: TextStyle["fontWeight"];
    letterSpacing: number;
    lineHeight: number;
    fontVariant?: TextStyle["fontVariant"];
  };
  const style: FontStyle = {
    fontSize: entry.fontSize,
    fontWeight: entry.fontWeight,
    letterSpacing: entry.letterSpacing,
    lineHeight: entry.lineHeight,
  };
  if (entry.fontVariant) style.fontVariant = [...entry.fontVariant];
  if (entry.fontRole === "display") style.fontFamily = fontFamily.display;
  if (entry.fontRole === "mono") {
    style.fontFamily = Platform.OS === "ios" ? fontFamily.mono.ios : fontFamily.mono.android;
  }
  return style;
}
