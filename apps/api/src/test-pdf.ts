import { dirname } from "node:path";
import { print } from "@moonx/ui-tokens/print";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

// The Pitch Deck PDF as the tests read it back, with pdf.js.

/** pdf.js's own data of the standard 14 fonts. */
const STANDARD_FONTS = `${dirname(
  Bun.resolveSync("pdfjs-dist/package.json", import.meta.dir),
)}/standard_fonts/`;

/** A text run of a page. */
export interface PdfText {
  str: string;
  x: number;
  /** From the top of the page to the baseline, in pt. */
  y: number;
  size: number;
  width: number;
  font: string;
}

/** A rectangle on a page, in pt from its top left. */
export interface PdfBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The pages of a PDF as pdf.js reads them: their size, text runs and clipping boxes. */
export async function readPdf(bytes: ArrayBuffer | Uint8Array) {
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    fontExtraProperties: true,
    // react-pdf names Helvetica, unembedded, for a line feed in a text.
    standardFontDataUrl: STANDARD_FONTS,
  });
  const document = await task.promise;
  const pages: {
    width: number;
    height: number;
    texts: PdfText[];
    clips: PdfBox[];
  }[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const operators = await page.getOperatorList();
    // react-pdf sets a clip as `clip` and then its path, whose last argument is the
    // path's bounds [minX, minY, maxX, maxY], drawn top down.
    const clips = operators.fnArray.flatMap((fn, index) => {
      if (
        fn !== OPS.clip ||
        operators.fnArray[index + 1] !== OPS.constructPath
      ) {
        return [];
      }
      const bounds = (operators.argsArray[index + 1] as unknown[])[2] as
        | ArrayLike<number>
        | undefined;
      return bounds === undefined
        ? []
        : [
            {
              left: bounds[0] as number,
              top: bounds[1] as number,
              right: bounds[2] as number,
              bottom: bounds[3] as number,
            },
          ];
    });
    const [, , width = 0, height = 0] = page.view;
    const content = await page.getTextContent();
    const texts = content.items.flatMap((item) => {
      if (!("str" in item) || item.str.trim() === "") return [];
      const font = page.commonObjs.get(item.fontName) as {
        name?: string;
      } | null;
      return [
        {
          str: item.str,
          x: item.transform[4] as number,
          y: height - (item.transform[5] as number),
          size: item.transform[0] as number,
          width: item.width,
          font: font?.name ?? "",
        },
      ];
    });
    pages.push({ width, height, texts, clips });
  }
  await task.destroy();
  return pages;
}

export const pageText = (page: { texts: PdfText[] }) =>
  page.texts.map((text) => text.str).join(" ");

/** The bottom of a slide's body: everything but the footer stays above it. */
const BODY_BOTTOM =
  print.slide.height -
  print.slide.marginY -
  print.slide.footerHeight -
  print.slide.gap;

/** A slide's body, which clips what runs past it. */
export const BODY_BOX: PdfBox = {
  left: print.slide.marginX,
  top: print.slide.marginY,
  right: print.slide.width - print.slide.marginX,
  bottom: BODY_BOTTOM,
};

/**
 * How far below the baseline the slides' glyphs reach, in em: IBM Plex Sans's descent.
 * No glyph of IBM Plex Sans or IBM Plex Sans JP reaches lower (their lowest are at
 * 0.266 and 0.223 em), nor do the characters the slides set in IBM Plex Mono (0.212 em);
 * IBM Plex Sans JP declares a descent of 0.44 em, more than its glyphs use.
 */
const GLYPH_DEPTH = 0.275;

/**
 * The texts of the pages that reach below the body's bottom, the footer's aside: what a
 * slide cut at its bottom shows, in part or whole.
 */
export const textsBelowBody = (pages: { texts: PdfText[] }[]) =>
  pages.flatMap((page, index) =>
    page.texts
      .filter(
        (text) =>
          text.size !== print.fontSize.footer &&
          text.y + GLYPH_DEPTH * text.size > BODY_BOTTOM,
      )
      .map((text) => ({ page: index + 1, str: text.str })),
  );
