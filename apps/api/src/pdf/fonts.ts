import { createRequire } from "node:module";
import { Font } from "@react-pdf/renderer";

const require = createRequire(import.meta.url);
const file = (family: string, weight: string, name: string) =>
  require.resolve(`@expo-google-fonts/${family}/${weight}/${name}_${weight}.ttf`);

let registered = false;

/**
 * Registers the PDF fonts of `semantic.print` (06_design-tokens.json): Fraunces for headings,
 * Noto Sans for text and Noto Sans JP as the fallback for Japanese. react-pdf reads a font file
 * on first use and keeps it in memory, and embeds only the glyphs a document uses (ADR-012).
 */
export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Fraunces",
    fonts: [{ src: file("fraunces", "600SemiBold", "Fraunces"), fontWeight: 600 }],
  });
  Font.register({
    family: "Noto Sans",
    fonts: [
      { src: file("noto-sans", "400Regular", "NotoSans"), fontWeight: 400 },
      { src: file("noto-sans", "500Medium", "NotoSans"), fontWeight: 500 },
      { src: file("noto-sans", "600SemiBold", "NotoSans"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "Noto Sans JP",
    fonts: [
      { src: file("noto-sans-jp", "400Regular", "NotoSansJP"), fontWeight: 400 },
      { src: file("noto-sans-jp", "500Medium", "NotoSansJP"), fontWeight: 500 },
      { src: file("noto-sans-jp", "600SemiBold", "NotoSansJP"), fontWeight: 600 },
    ],
  });
  // Words are never hyphenated: Latin words stay whole and Japanese breaks between characters.
  Font.registerHyphenationCallback((word) => [word]);
}
