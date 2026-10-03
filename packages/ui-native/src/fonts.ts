/// <reference path="./assets.d.ts" />
import Fraunces_600SemiBold from "@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf";
import { useFonts } from "expo-font";

/**
 * Loads the display face under the family name the tokens use (`fontFamily.display`). Headings
 * use one weight (600), so one static file is bundled (the package's index would pull in all 18). Returns false until the font is ready;
 * the root layout holds the splash screen until then.
 */
export function useDisplayFont(): boolean {
  const [loaded] = useFonts({ Fraunces: Fraunces_600SemiBold });
  return loaded;
}
