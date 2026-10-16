import { readFileSync } from "node:fs";
import { CJK_CHARACTER, type MeasureText, type PitchFont } from "@moonx/domain";
import { print } from "@moonx/ui-tokens/print";
import { Font } from "@react-pdf/renderer";
import * as fontkit from "fontkit";

// The PDF's fonts (ADR-012): IBM Plex Sans and IBM Plex Mono from the npm packages of
// Expo Google Fonts (one TTF per weight), with IBM Plex Sans JP for the characters they
// lack, as `semantic.print.font` lists them. react-pdf embeds only the glyphs it uses.
// The fit of the slides measures text with the same files, so a slide the fit passes is
// the slide react-pdf sets.

/** The weights `semantic.print.typography` uses, and the bullet labels' semibold. */
const WEIGHTS = { 400: "Regular", 500: "Medium", 600: "SemiBold" } as const;
type Weight = keyof typeof WEIGHTS;

const PACKAGES = {
  "IBM Plex Sans": ["ibm-plex-sans", "IBMPlexSans"],
  "IBM Plex Mono": ["ibm-plex-mono", "IBMPlexMono"],
  "IBM Plex Sans JP": ["ibm-plex-sans-jp", "IBMPlexSansJP"],
} as const;
type Family = keyof typeof PACKAGES;

const fontFile = (family: Family, weight: Weight) => {
  const [name, file] = PACKAGES[family];
  const style = `${weight}${WEIGHTS[weight]}`;
  return Bun.resolveSync(
    `@expo-google-fonts/${name}/${style}/${file}_${style}.ttf`,
    import.meta.dir,
  );
};

const FAMILIES = Object.keys(PACKAGES) as Family[];
const WEIGHT_LIST = Object.keys(WEIGHTS).map(Number) as Weight[];

/** The fallback order of `semantic.print.font.body` and `.mono`. */
const STACKS: Record<PitchFont["family"], readonly string[]> = {
  body: print.font.body,
  mono: print.font.mono,
};

const isWeight = (weight: number): weight is Weight => weight in WEIGHTS;

/** A glyph's header: its number of contours and bounding box. */
const GLYPH_HEADER_BYTES = 10;

/**
 * The bytes of a font file, and how react-pdf is to read them. fontkit 2.0.4, which
 * react-pdf also uses, reads a glyph's header even when the glyph is empty, so an empty
 * glyph at the very end of `glyf` reads past the file when `glyf` is its last table, as
 * the space of these IBM Plex Mono files is. Zeros after the end read as the empty glyph
 * it is; react-pdf takes such a file as a data URL, the others by their path.
 */
function readFont(path: string): { face: fontkit.Font; src: string } {
  const bytes = new Uint8Array(readFileSync(path));
  const glyf = (
    fontkit.create(Buffer.from(bytes)) as fontkit.Font & {
      directory: { tables: Record<string, { offset: number; length: number }> };
    }
  ).directory.tables.glyf;
  if (
    glyf === undefined ||
    glyf.offset + glyf.length + GLYPH_HEADER_BYTES <= bytes.length
  ) {
    return {
      face: fontkit.create(Buffer.from(bytes)) as fontkit.Font,
      src: path,
    };
  }
  const padded = new Uint8Array(bytes.length + GLYPH_HEADER_BYTES);
  padded.set(bytes);
  const data = Buffer.from(padded);
  return {
    face: fontkit.create(data) as fontkit.Font,
    src: `data:font/ttf;base64,${data.toString("base64")}`,
  };
}

/**
 * react-pdf's hyphenation callback: a word stays whole, but may break before and after
 * each CJK character, as the fit breaks lines. react-pdf puts a hyphen at the end of a
 * line broken between two parts of a word, except where an empty part lies between
 * them: it reads that as a space of no width.
 */
const breakAtCjk = (word: string): string[] => {
  const parts: string[] = [];
  let run = "";
  for (const char of word) {
    if (!CJK_CHARACTER.test(char)) {
      run += char;
      continue;
    }
    if (run !== "") parts.push(run, "");
    run = "";
    parts.push(char, "");
  }
  if (run !== "") parts.push(run);
  return parts;
};

let loaded: Promise<MeasureText> | undefined;

/**
 * Registers the fonts with react-pdf and loads every one of them (SDD 7.3: loaded at
 * start, so the first PDF does not wait for them). Resolves to the measure the fit uses.
 * Words are not hyphenated: the fit breaks lines only at spaces and around CJK
 * characters.
 */
export function loadPitchFonts(): Promise<MeasureText> {
  loaded ??= (async () => {
    const faces = new Map<string, fontkit.Font>();
    for (const family of FAMILIES) {
      Font.register({
        family,
        fonts: WEIGHT_LIST.map((fontWeight) => {
          const { face, src } = readFont(fontFile(family, fontWeight));
          faces.set(`${family}/${fontWeight}`, face);
          return { src, fontWeight };
        }),
      });
    }
    Font.registerHyphenationCallback(breakAtCjk);
    await Promise.all(
      FAMILIES.flatMap((fontFamily) =>
        WEIGHT_LIST.map((fontWeight) => Font.load({ fontFamily, fontWeight })),
      ),
    );
    return (text, font) => {
      if (!isWeight(font.weight)) {
        throw new Error(`No font of weight ${font.weight}`);
      }
      const stack = STACKS[font.family].map((family) => {
        const face = faces.get(`${family}/${font.weight}`);
        if (face === undefined) throw new Error(`No font ${family}`);
        return face;
      });
      // As react-pdf does: each character in the first font of the stack that has it,
      // consecutive characters of one font shaped together.
      let width = 0;
      let run = "";
      let runFace: fontkit.Font | undefined;
      const flush = () => {
        if (runFace !== undefined && run !== "") {
          width +=
            (runFace.layout(run).advanceWidth * font.size) / runFace.unitsPerEm;
        }
        run = "";
      };
      for (const char of text) {
        const point = char.codePointAt(0) ?? 0;
        // A character no font has: react-pdf takes the last font of the stack.
        const face =
          stack.find((candidate) => candidate.hasGlyphForCodePoint(point)) ??
          stack.at(-1);
        if (face !== runFace) {
          flush();
          runFace = face;
        }
        run += char;
      }
      flush();
      return width;
    };
  })();
  return loaded;
}
