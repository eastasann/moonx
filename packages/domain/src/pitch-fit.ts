import { i18n } from "@moonx/i18n";
import type {
  PitchBullet,
  PitchDeck,
  PitchSlide,
  PitchSlideType,
} from "@moonx/schemas";
import { formatMetric } from "./pitch";

// Fitting a slide into `semantic.print.slide` (design-spec 6.14): every font size of a
// slide goes down by the shrink step together, each stopping at its `-min`, until the
// slide fits; if it still does not, the longest texts lose lines from their end, which
// then ends in "…". The layout here is the one the PDF draws and 23 copies, so both get
// the same sizes and the same cut texts from P12.

/** A font of the slides as `MeasureText` reads it. */
export interface PitchFont {
  family: "body" | "mono";
  weight: number;
  size: number;
}

/** The advance width in pt of `text` set in `font`, from the PDF's own font files. */
export type MeasureText = (text: string, font: PitchFont) => number;

interface Typography {
  fontWeight: number;
  lineHeight: number;
}

/** What the fit reads of `semantic.print` (the `print` constants of @moonx/ui-tokens). */
export interface PitchPrint {
  slide: {
    width: number;
    height: number;
    marginX: number;
    marginY: number;
    gap: number;
    footerHeight: number;
    shrinkStep: number;
    bulletGap: number;
    noteGap: number;
    bulletIndent: number;
    figureGap: number;
    cellPaddingX: number;
    cellPaddingY: number;
    ruleWidth: number;
    hairlineWidth: number;
  };
  fontSize: {
    title: {
      title: number;
      titleMin: number;
      subtitle: number;
      subtitleMin: number;
    };
    text: {
      heading: number;
      headingMin: number;
      bullet: number;
      bulletMin: number;
    };
    number: {
      heading: number;
      headingMin: number;
      figure: number;
      figureMin: number;
      figureLabel: number;
      figureLabelMin: number;
    };
    table: {
      heading: number;
      headingMin: number;
      cell: number;
      cellMin: number;
    };
  };
  typography: Record<
    | "title"
    | "heading"
    | "subtitle"
    | "bullet"
    | "figure"
    | "figureLabel"
    | "cell"
    | "cellNumber",
    Typography
  >;
}

/** The font sizes of a slide at a shrink level. */
export interface PitchSizes {
  /** The slide's name; the title slide's Business Name. */
  heading: number;
  subtitle: number;
  /** A text slide's bullets, a number or table slide's notes, the title slide's lines. */
  bullet: number;
  figure: number;
  figureLabel: number;
  cell: number;
}

/**
 * react-pdf breaks lines with Knuth–Plass, which may break a line earlier than the
 * first-fit breaking measured here. Measuring at this share of each width keeps the line
 * count here at or above what react-pdf and the browser set, so a fitted slide fits.
 */
const FIT_WIDTH = 0.95;

/**
 * Lines added to a text with CJK in it. Between CJK characters react-pdf has breaks that
 * cannot stretch, so Knuth–Plass may start such a text on the line after a label rather
 * than finish that line with it: one more line than first-fit at most.
 */
const CJK_EXTRA_LINES = 1;

/** The width of a slide's content and the height its body may take above the footer. */
export const pitchFrame = (print: PitchPrint) => {
  const { width, height, marginX, marginY, footerHeight, gap } = print.slide;
  return {
    contentWidth: width - 2 * marginX,
    bodyHeight: height - 2 * marginY - footerHeight - gap,
  };
};

/** The font sizes of a slide of `type` after `shrink` steps (06 `semantic.print`). */
export const pitchSizes = (
  type: PitchSlideType,
  shrink: number,
  print: PitchPrint,
): PitchSizes => {
  const { fontSize: f, slide } = print;
  const size = (max: number, min: number) =>
    Math.max(min, max - shrink * slide.shrinkStep);
  const subtitle = size(f.title.subtitle, f.title.subtitleMin);
  const figureLabel = size(f.number.figureLabel, f.number.figureLabelMin);
  const cell = size(f.table.cell, f.table.cellMin);
  return {
    heading:
      type === "title"
        ? size(f.title.title, f.title.titleMin)
        : size(f[type].heading, f[type].headingMin),
    subtitle,
    // Notes under figures and tables are the size of a table's cells (6.14).
    bullet:
      type === "text"
        ? size(f.text.bullet, f.text.bulletMin)
        : type === "title"
          ? subtitle
          : cell,
    figure: size(f.number.figure, f.number.figureMin),
    figureLabel,
    cell,
  };
};

/** The typography of a slide's bullets: notes under figures and tables are cells. */
export const bulletTypography = (type: PitchSlideType, print: PitchPrint) =>
  type === "text"
    ? print.typography.bullet
    : type === "title"
      ? print.typography.subtitle
      : print.typography.cell;

/** The space between bullets: notes under figures and tables sit closer. */
export const bulletGap = (type: PitchSlideType, print: PitchPrint) =>
  type === "text" ? print.slide.bulletGap : print.slide.noteGap;

/** The shrink level at which every size a slide uses is at its minimum. */
const maxShrink = (slide: PitchSlide, print: PitchPrint) => {
  const { fontSize: f, slide: frame } = print;
  const ranges: [number, number][] = [];
  if (slide.type === "title") {
    ranges.push(
      [f.title.title, f.title.titleMin],
      [f.title.subtitle, f.title.subtitleMin],
    );
  } else {
    ranges.push([f[slide.type].heading, f[slide.type].headingMin]);
  }
  if (slide.type === "text") ranges.push([f.text.bullet, f.text.bulletMin]);
  if (
    slide.type === "table" ||
    (slide.type === "number" && slide.bullets.length > 0)
  ) {
    ranges.push([f.table.cell, f.table.cellMin]);
  }
  if (slide.numbers.length > 0 || slide.type === "number") {
    ranges.push(
      [f.number.figure, f.number.figureMin],
      [f.number.figureLabel, f.number.figureLabelMin],
    );
  }
  return Math.max(
    ...ranges.map(([max, min]) => Math.ceil((max - min) / frame.shrinkStep)),
  );
};

// ---- Line breaking ----

interface Segment {
  text: string;
  font: PitchFont;
}

/** A line as [start, end) offsets into the segments' joined text. */
interface Line {
  start: number;
  end: number;
}

/**
 * Lines may break before and after each of these characters, as UAX #14 allows for CJK.
 * The API's react-pdf hyphenation callback breaks at the same characters.
 */
export const CJK_CHARACTER = /[　-ヿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/u;

/** A unit no line breaks inside: a word with the spaces after it, or one CJK character. */
interface Piece {
  start: number;
  end: number;
  /** Without the trailing spaces, which hang past the end of a line. */
  visible: number;
  advance: number;
  forcedBreak: boolean;
  /** Its segment's: no piece spans two segments. */
  font: PitchFont;
}

function pieces(segments: readonly Segment[], measure: MeasureText): Piece[] {
  const result: Piece[] = [];
  let offset = 0;
  for (const { text, font } of segments) {
    const chars = [...text];
    let i = 0;
    let at = offset;
    while (i < chars.length) {
      const char = chars[i] as string;
      if (char === "\n") {
        result.push({
          start: at,
          end: at + 1,
          visible: 0,
          advance: 0,
          forcedBreak: true,
          font,
        });
        i += 1;
        at += 1;
        continue;
      }
      let j = i + 1;
      if (!CJK_CHARACTER.test(char)) {
        while (
          j < chars.length &&
          chars[j] !== " " &&
          chars[j] !== "\n" &&
          !CJK_CHARACTER.test(chars[j] as string)
        ) {
          j += 1;
        }
      }
      let k = j;
      while (k < chars.length && chars[k] === " ") k += 1;
      const word = chars.slice(i, j).join("");
      const spaces = chars.slice(j, k).join("");
      const visible = word === "" ? 0 : measure(word, font);
      const length = word.length + spaces.length;
      result.push({
        start: at,
        end: at + length,
        visible,
        advance: visible + (spaces === "" ? 0 : measure(spaces, font)),
        forcedBreak: false,
        font,
      });
      i = k;
      at += length;
    }
    offset += text.length;
  }
  return result;
}

/**
 * First-fit line breaking of `segments` at `width`: at spaces, between CJK characters,
 * at line feeds, and inside a word only when the word alone is wider than the line.
 */
function wrap(
  segments: readonly Segment[],
  width: number,
  measure: MeasureText,
): Line[] {
  const text = segments.map((segment) => segment.text).join("");
  const lines: Line[] = [];
  let line: Line | null = null;
  let used = 0;
  const close = () => {
    if (line !== null) lines.push(line);
    line = null;
    used = 0;
  };
  for (const piece of pieces(segments, measure)) {
    if (piece.forcedBreak) {
      if (line === null) lines.push({ start: piece.start, end: piece.start });
      else close();
      continue;
    }
    if (line !== null && used + piece.visible > width) close();
    if (line === null && piece.visible > width) {
      // A word wider than the line breaks between its characters.
      const parts = chunks(
        text.slice(piece.start, piece.end),
        piece.font,
        width,
        measure,
      );
      let start = piece.start;
      for (const part of parts.slice(0, -1)) {
        lines.push({ start, end: start + part.length });
        start += part.length;
      }
      line = { start, end: piece.end };
      used = measure(parts.at(-1) ?? "", piece.font);
      continue;
    }
    if (line === null) line = { start: piece.start, end: piece.end };
    else line.end = piece.end;
    used += piece.advance;
  }
  close();
  return lines.length === 0 ? [{ start: 0, end: 0 }] : lines;
}

/**
 * Cuts the last segment's text so the segments take at most `maxLines` lines at
 * `width`, ending in "…".
 */
function cut(
  segments: readonly Segment[],
  width: number,
  maxLines: number,
  measure: MeasureText,
): string {
  const last = segments.at(-1);
  if (last === undefined) throw new Error("A text without segments");
  const text = segments.map((segment) => segment.text).join("");
  const textStart = text.length - last.text.length;
  const lines = wrap(segments, width, measure);
  const kept = lines[maxLines - 1];
  if (kept === undefined || lines.length <= maxLines) return last.text;
  const mark = i18n.t("pitch:ellipsis");
  const ellipsis = measure(mark, last.font);
  let end = kept.end;
  while (end > Math.max(kept.start, textStart)) {
    const shown = text.slice(kept.start, end).trimEnd();
    const shownWidth = measureLine(
      segments,
      kept.start,
      kept.start + shown.length,
      measure,
    );
    if (shownWidth + ellipsis <= width) break;
    // One character back, as a reader sees characters.
    end -=
      graphemes(text.slice(Math.max(kept.start, textStart), end)).at(-1)
        ?.length ?? 1;
  }
  return `${last.text.slice(0, Math.max(0, end - textStart)).trimEnd()}${mark}`;
}

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

/** The characters of `text` as a reader sees them: an emoji of several code points is one. */
const graphemes = (text: string) =>
  Array.from(GRAPHEMES.segment(text), (part) => part.segment);

/** A word wider than `width` in pieces no wider, each as full as it can be. */
function chunks(
  word: string,
  font: PitchFont,
  width: number,
  measure: MeasureText,
): string[] {
  const pieces: string[] = [];
  let piece = "";
  let used = 0;
  for (const char of graphemes(word)) {
    const advance = measure(char, font);
    if (piece !== "" && used + advance > width && char !== " ") {
      pieces.push(piece);
      piece = "";
      used = 0;
    }
    piece += char;
    used += advance;
  }
  pieces.push(piece);
  return pieces;
}

/**
 * `text` as the PDF is to set it in a box `boxWidth` wide: a line feed between the
 * pieces of each word wider than the box, where the fit broke it. react-pdf breaks lines
 * only at spaces and around CJK characters, and would set such a word on one line across
 * the box's edge.
 */
export function breakLongWords(
  text: string,
  font: PitchFont,
  boxWidth: number,
  measure: MeasureText,
): string {
  const width = boxWidth * FIT_WIDTH;
  // The pieces the fit breaks between: spaces, line feeds, CJK characters and runs of
  // the rest.
  const runs = text.split(new RegExp(`([ \\n]+|${CJK_CHARACTER.source})`, "u"));
  return runs
    .map((run) =>
      run === "" || /^[ \n]+$/u.test(run) || CJK_CHARACTER.test(run)
        ? run
        : measure(run, font) <= width
          ? run
          : chunks(run, font, width, measure).join("\n"),
    )
    .join("");
}

/**
 * `measure` remembering each text's width per font family and weight: glyph advances
 * scale with the size, and the fit measures the same words at every shrink level.
 */
const remembering = (measure: MeasureText): MeasureText => {
  const widths = new Map<string, number>();
  return (text, font) => {
    const key = `${font.family}/${font.weight}/${text}`;
    let unit = widths.get(key);
    if (unit === undefined) {
      unit = measure(text, { ...font, size: 1 });
      widths.set(key, unit);
    }
    return unit * font.size;
  };
};

/** The width of [start, end) of the segments' joined text. */
function measureLine(
  segments: readonly Segment[],
  start: number,
  end: number,
  measure: MeasureText,
): number {
  let width = 0;
  let offset = 0;
  for (const segment of segments) {
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + segment.text.length);
    if (from < to) {
      const part = segment.text.slice(from - offset, to - offset);
      // A long word is broken by the sum of its characters (chunks), which kerning
      // can make wider than the word shaped whole.
      width += Math.max(
        measure(part, segment.font),
        graphemes(part).reduce(
          (sum, char) => sum + measure(char, segment.font),
          0,
        ),
      );
    }
    offset += segment.text.length;
  }
  return width;
}

// ---- Figures ----

/** A figure of a number slide (or the economics slide) as the PDF sets it. */
export interface PitchFigure {
  label: string;
  /** The formatted value, or why there is none. */
  text: string;
  /** A reason, which breaks between its words; a value never breaks. */
  wraps: boolean;
  valueFont: PitchFont;
  valueLineHeight: number;
  labelFont: PitchFont;
  width: number;
}

/**
 * The figures of `slide` side by side at `sizes`. A value never breaks, so each column
 * is as wide as its value or its label on one line, and the room left over is shared out
 * equally. `fits` is false when even that is wider than the slide; the columns then
 * share the width by those widths, and long values break.
 */
export function figureColumns(
  slide: PitchSlide,
  sizes: PitchSizes,
  options: FitOptions,
): PitchFigure[] & { fits: boolean } {
  const { print, measure, currency } = options;
  const { typography } = print;
  const { contentWidth } = pitchFrame(print);
  const labelFont: PitchFont = {
    family: "body",
    weight: typography.figureLabel.fontWeight,
    size: sizes.figureLabel,
  };
  const natural = slide.numbers.map((number) => {
    const text = formatMetric(number.metricKey, number.value, currency);
    // Without a value, the reason is set in the label's font (design-spec 6.4).
    const valueFont: PitchFont =
      number.value.value === null
        ? labelFont
        : {
            family: "mono",
            weight: typography.figure.fontWeight,
            size: sizes.figure,
          };
    const valueLineHeight =
      number.value.value === null
        ? sizes.figureLabel * typography.figureLabel.lineHeight
        : sizes.figure * typography.figure.lineHeight;
    const wraps = number.value.value === null;
    const width = Math.max(
      wraps
        ? Math.max(
            ...text.split(/\s+/u).map((word) => measure(word, labelFont)),
          )
        : measure(text, valueFont),
      measure(number.label, labelFont),
    );
    return {
      label: number.label,
      text,
      wraps,
      valueFont,
      valueLineHeight,
      labelFont,
      width,
    };
  });
  const gaps = Math.max(0, natural.length - 1) * print.slide.gap;
  const total = natural.reduce((sum, figure) => sum + figure.width, 0);
  const room = contentWidth - gaps;
  const fits = total <= room;
  const columns = natural.map((figure) => ({
    ...figure,
    width: fits
      ? figure.width + (room - total) / natural.length
      : (room * figure.width) / total,
  }));
  return Object.assign(columns, { fits });
}

// ---- Slide layout ----

/** A text of the slide that may be cut, with what it takes at the current sizes. */
interface Block {
  segments: Segment[];
  width: number;
  lineHeight: number;
  lines: number;
  /** The lines it may take; below `lines`, it is cut. */
  cap: number;
  /** Lines counted beyond first-fit (CJK_EXTRA_LINES), which a cut keeps. */
  extra: number;
  /** Its place in drawing order. */
  order: number;
  apply(text: string): void;
}

interface Layout {
  /** Height from the blocks' capped lines. */
  height(): number;
  blocks: Block[];
  /** The figures are narrower than the slide, so no value breaks. */
  figuresFit: boolean;
}

const NOT_WRITTEN = () => i18n.t("pitch:notWrittenYet");

/** The order a slide's texts are drawn in, top to bottom (6.14 cuts the later on a tie). */
const DRAWN = {
  heading: 0,
  subtitle: 1,
  titleLines: 2,
  table: 3,
  bullets: 4,
} as const;

/**
 * The layout of `slide` at the sizes of `shrink`, as the PDF draws it: the heights it
 * stacks and the texts in it that may be cut. `slide` is a copy the blocks write into.
 */
function layout(
  slide: PitchSlide,
  shrink: number,
  options: FitOptions,
): Layout {
  const { print, measure } = options;
  const { slide: frame, typography } = print;
  const { contentWidth } = pitchFrame(print);
  const sizes = pitchSizes(slide.type, shrink, print);
  const body = (size: number, weight: number): PitchFont => ({
    family: "body",
    weight,
    size,
  });
  const blocks: Block[] = [];
  const block = (
    segments: Segment[],
    width: number,
    lineHeight: number,
    apply: (text: string) => void,
    /** Where the text is drawn, cut last first on a tie; null: never cut. */
    order: number | null,
    share = FIT_WIDTH,
  ): Block => {
    const extra = segments.some((segment) => CJK_CHARACTER.test(segment.text))
      ? CJK_EXTRA_LINES
      : 0;
    const lines = wrap(segments, width * share, measure).length + extra;
    const made: Block = {
      segments,
      width: width * share,
      lineHeight,
      lines,
      cap: lines,
      extra,
      order: order ?? 0,
      apply,
    };
    if (order !== null) blocks.push(made);
    return made;
  };
  const heightOf = (made: Block) => made.cap * made.lineHeight;

  const headingType =
    slide.type === "title" ? typography.title : typography.heading;
  const heading = block(
    [
      {
        text: slide.title.text,
        font: body(sizes.heading, headingType.fontWeight),
      },
    ],
    contentWidth,
    sizes.heading * headingType.lineHeight,
    (text) => {
      slide.title = { ...slide.title, text };
    },
    slide.type === "title" ? DRAWN.heading : null,
  );
  const parts: (() => number)[] = [() => heightOf(heading)];
  const gap = () => frame.gap;

  const bulletType = bulletTypography(slide.type, print);
  const bulletBlocks = slide.bullets.map((bullet, index) =>
    block(
      [
        {
          text: i18n.t("pitch:label", { label: bullet.label }),
          font: body(sizes.bullet, typography.heading.fontWeight),
        },
        { text: bullet.text, font: body(sizes.bullet, bulletType.fontWeight) },
      ],
      slide.type === "title" ? contentWidth : contentWidth - frame.bulletIndent,
      sizes.bullet * bulletType.lineHeight,
      (text) => {
        slide.bullets[index] = {
          ...(slide.bullets[index] as PitchBullet),
          text,
        };
      },
      (slide.type === "title" ? DRAWN.titleLines : DRAWN.bullets) +
        index / 1000,
    ),
  );
  const bulletsHeight = () =>
    bulletBlocks.reduce((sum, made) => sum + heightOf(made), 0) +
    (slide.type === "title"
      ? 0
      : Math.max(0, bulletBlocks.length - 1) * bulletGap(slide.type, print));

  // Figures: a rule, the value (or why there is none) and the label, side by side.
  const figures = figureColumns(slide, sizes, options);
  const figuresHeight = (() => {
    if (figures.length === 0) return () => 0;
    // A column is as wide as its value and label on one line: measured at full width.
    const share = figures.fits ? 1 : FIT_WIDTH;
    const columns = figures.map((figure) => {
      const value = block(
        [{ text: figure.text, font: figure.valueFont }],
        figure.width,
        figure.valueLineHeight,
        () => {},
        null,
        figure.wraps ? FIT_WIDTH : share,
      );
      const label = block(
        [{ text: figure.label, font: figure.labelFont }],
        figure.width,
        sizes.figureLabel * typography.figureLabel.lineHeight,
        () => {},
        null,
        share,
      );
      return heightOf(value) + heightOf(label);
    });
    return () => frame.ruleWidth + frame.figureGap + Math.max(...columns);
  })();

  const tableHeight = (() => {
    const table = slide.table;
    if (table === null) return () => 0;
    const padding = 2 * frame.cellPaddingY + frame.hairlineWidth;
    const lineHeight = sizes.cell * typography.cell.lineHeight;
    const inner = (share: number) =>
      share * contentWidth - 2 * frame.cellPaddingX;
    const header = Math.max(
      ...table.columns.map(
        (column) =>
          block(
            [
              {
                text: column.label,
                font: body(sizes.cell, typography.figureLabel.fontWeight),
              },
            ],
            inner(column.width),
            lineHeight,
            () => {},
            null,
          ).lines,
      ),
    );
    if (table.rows.length === 0) {
      const empty = block(
        [
          {
            text: NOT_WRITTEN(),
            font: body(sizes.cell, typography.cell.fontWeight),
          },
        ],
        contentWidth - 2 * frame.cellPaddingX,
        lineHeight,
        () => {},
        null,
      );
      return () => header * lineHeight + padding + heightOf(empty) + padding;
    }
    const rows = table.rows.map((row, rowIndex) =>
      row.map((cell, columnIndex) => {
        const column = table.columns[columnIndex];
        if (column === undefined) throw new Error("A cell without a column");
        const share = column.width;
        const font: PitchFont = column.numeric
          ? {
              family: "mono",
              weight: typography.cellNumber.fontWeight,
              size: sizes.cell,
            }
          : body(sizes.cell, typography.cell.fontWeight);
        return block(
          [{ text: cell ?? "", font }],
          inner(share),
          lineHeight,
          (text) => {
            const target = slide.table?.rows[rowIndex];
            if (target !== undefined) target[columnIndex] = text;
          },
          cell === null
            ? null
            : DRAWN.table +
                (rowIndex * table.columns.length + columnIndex) / 1e6,
        );
      }),
    );
    return () =>
      header * lineHeight +
      padding +
      rows.reduce(
        (sum, cells) =>
          sum + Math.max(lineHeight, ...cells.map(heightOf)) + padding,
        0,
      );
  })();

  if (slide.type === "title") {
    const subtitle = slide.subtitle;
    if (subtitle !== null) {
      const made = block(
        [
          {
            text: subtitle.text,
            font: body(sizes.subtitle, typography.subtitle.fontWeight),
          },
        ],
        contentWidth,
        sizes.subtitle * typography.subtitle.lineHeight,
        (text) => {
          slide.subtitle = { ...subtitle, text };
        },
        DRAWN.subtitle,
      );
      parts.push(gap, () => heightOf(made));
    }
    parts.push(gap, () => frame.ruleWidth, gap, bulletsHeight);
  } else {
    parts.push(gap);
    if (slide.numbers.length > 0) {
      parts.push(figuresHeight);
      if (slide.table !== null) parts.push(gap);
    }
    if (slide.table !== null) parts.push(tableHeight);
    if (slide.type === "text") parts.push(bulletsHeight);
    else if (slide.bullets.length > 0) parts.push(gap, bulletsHeight);
  }

  return {
    blocks: blocks.toSorted((a, b) => a.order - b.order),
    height: () => parts.reduce((sum, part) => sum + part(), 0),
    figuresFit: figures.fits,
  };
}

export interface FitOptions {
  print: PitchPrint;
  measure: MeasureText;
  currency: string;
}

const copy = (slide: PitchSlide): PitchSlide => structuredClone(slide);

/**
 * Fits one slide (design-spec 6.14): the first shrink level at which it fits; or, at the
 * smallest sizes, the texts cut from the one taking the most lines (the later one on a
 * tie) until it fits, each keeping at least one line.
 */
export function fitPitchSlide(
  slide: PitchSlide,
  given: FitOptions,
): PitchSlide {
  const options = { ...given, measure: remembering(given.measure) };
  const { bodyHeight } = pitchFrame(options.print);
  const last = maxShrink(slide, options.print);
  for (let shrink = 0; shrink < last; shrink += 1) {
    const tried = layout(copy(slide), shrink, options);
    if (tried.figuresFit && tried.height() <= bodyHeight) {
      return { ...slide, shrink, overflow: false };
    }
  }
  const fitted = copy(slide);
  const at = layout(fitted, last, options);
  if (at.figuresFit && at.height() <= bodyHeight)
    return { ...fitted, shrink: last, overflow: false };
  while (at.height() > bodyHeight) {
    let longest: Block | undefined;
    for (const made of at.blocks) {
      if (
        made.cap > 1 + made.extra &&
        (longest === undefined || made.cap >= longest.cap)
      ) {
        longest = made;
      }
    }
    if (longest === undefined) break;
    longest.cap -= 1;
  }
  // Values that break, or still too tall once every text is down to a line: shown as
  // cut all the same.
  let overflow = !at.figuresFit || at.height() > bodyHeight;
  for (const made of at.blocks) {
    if (made.cap < made.lines) {
      made.apply(
        cut(made.segments, made.width, made.cap - made.extra, options.measure),
      );
      overflow = true;
    }
  }
  return { ...fitted, shrink: last, overflow };
}

/**
 * `slide` with {@link breakLongWords} applied to each text in the box and font the fit
 * measured it in: what the PDF sets. P12 keeps the texts as they are; a browser breaks
 * such words itself.
 */
export function breakSlideWords(
  slide: PitchSlide,
  options: Pick<FitOptions, "print" | "measure">,
): PitchSlide {
  const { print, measure } = options;
  const { typography, slide: frame } = print;
  const { contentWidth } = pitchFrame(print);
  const sizes = pitchSizes(slide.type, slide.shrink, print);
  const body = (size: number, weight: number): PitchFont => ({
    family: "body",
    weight,
    size,
  });
  const bulletType = bulletTypography(slide.type, print);
  const bulletWidth =
    slide.type === "title" ? contentWidth : contentWidth - frame.bulletIndent;
  return {
    ...slide,
    title:
      slide.type === "title"
        ? {
            ...slide.title,
            text: breakLongWords(
              slide.title.text,
              body(sizes.heading, typography.title.fontWeight),
              contentWidth,
              measure,
            ),
          }
        : slide.title,
    subtitle:
      slide.subtitle === null
        ? null
        : {
            ...slide.subtitle,
            text: breakLongWords(
              slide.subtitle.text,
              body(sizes.subtitle, typography.subtitle.fontWeight),
              contentWidth,
              measure,
            ),
          },
    bullets: slide.bullets.map((bullet) => ({
      ...bullet,
      text: breakLongWords(
        bullet.text,
        body(sizes.bullet, bulletType.fontWeight),
        bulletWidth,
        measure,
      ),
    })),
    table:
      slide.table === null
        ? null
        : {
            ...slide.table,
            rows: slide.table.rows.map((row) =>
              row.map((cell, index) => {
                const column = slide.table?.columns[index];
                if (column === undefined) {
                  throw new Error("A cell without a column");
                }
                return cell === null
                  ? null
                  : breakLongWords(
                      cell,
                      column.numeric
                        ? {
                            family: "mono",
                            weight: typography.cellNumber.fontWeight,
                            size: sizes.cell,
                          }
                        : body(sizes.cell, typography.cell.fontWeight),
                      column.width * contentWidth - 2 * frame.cellPaddingX,
                      measure,
                    );
              }),
            ),
          },
  };
}

/** {@link fitPitchSlide} for every slide of `deck`. */
export const fitPitchDeck = (
  deck: PitchDeck,
  options: FitOptions,
): PitchDeck => ({
  ...deck,
  slides: deck.slides.map((slide) => fitPitchSlide(slide, options)),
});
