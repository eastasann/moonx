import {
  breakLongWords,
  breakSlideWords,
  bulletGap,
  bulletTypography,
  figureColumns,
  type MeasureText,
  type PitchFigure,
  pitchFrame,
  pitchSizes,
} from "@moonx/domain";
import { formatDate, i18n } from "@moonx/i18n";
import type { PitchBullet, PitchDeck, PitchSlide } from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import {
  Document,
  Page,
  renderToBuffer,
  Text,
  View,
} from "@react-pdf/renderer";

// The Pitch Deck PDF of P13 (ADR-012, design-spec 6.14): one landscape page of
// `semantic.print.slide` per slide, always in the light colours, drawn in the layout
// packages/domain fitted the slides to (pitch-fit.ts), with the footer on every page.
// The speaker notes stay out.

const { color, slide: frame, typography } = print;
const BODY = [...print.font.body];
const MONO = [...print.font.mono];

/**
 * A slide's content, at the top of the body in a box of no height of its own: react-pdf
 * sets each text in the height left to it, so a box the body's height would squeeze a
 * slide taller than the body, its lines overlapping. A slide still too tall once every
 * text is cut runs past the body's bottom and is cut there instead (design-spec 6.14).
 */
const UNBOUNDED = { position: "absolute", top: 0, left: 0, right: 0 } as const;

/**
 * The title slide is centred in the body, so it is set in it, keeping its height. Its
 * texts cut to a line or two always fit the body.
 */
const KEEP_HEIGHT = { flexShrink: 0 } as const;

export interface PitchPdfOptions {
  measure: MeasureText;
  currency: string;
  timeZone: string;
}

function Bullet({
  bullet,
  size,
  slide,
  last,
  measure,
}: {
  bullet: PitchBullet;
  size: number;
  slide: PitchSlide;
  last: boolean;
  measure: MeasureText;
}) {
  const type = bulletTypography(slide.type, print);
  const { contentWidth } = pitchFrame(print);
  // The label is set as the fit measured it, a word wider than the line in pieces
  // (breakSlideWords breaks the texts, which P12 also returns, but not the labels).
  const label = (
    <Text style={{ fontWeight: typography.heading.fontWeight }}>
      {breakLongWords(
        i18n.t("pitch:label", { label: bullet.label }),
        { family: "body", weight: typography.heading.fontWeight, size },
        slide.type === "title"
          ? contentWidth
          : contentWidth - frame.bulletIndent,
        measure,
      )}
    </Text>
  );
  const text = (
    <Text style={{ color: bullet.empty ? color.textPlaceholder : undefined }}>
      {bullet.text}
    </Text>
  );
  if (slide.type === "title") {
    return (
      <Text
        style={{
          fontSize: size,
          fontWeight: type.fontWeight,
          lineHeight: type.lineHeight,
          color: color.textSecondary,
        }}
      >
        {label}
        {text}
      </Text>
    );
  }
  return (
    <View
      style={{
        flexDirection: "row",
        marginBottom: last ? 0 : bulletGap(slide.type, print),
      }}
    >
      <Text
        style={{
          width: frame.bulletIndent,
          fontSize: size,
          lineHeight: type.lineHeight,
        }}
      >
        {i18n.t("pitch:bullet")}
      </Text>
      <Text
        style={{
          flex: 1,
          fontSize: size,
          fontWeight: type.fontWeight,
          lineHeight: type.lineHeight,
        }}
      >
        {label}
        {text}
      </Text>
    </View>
  );
}

function Bullets({
  slide,
  size,
  measure,
}: {
  slide: PitchSlide;
  size: number;
  measure: MeasureText;
}) {
  return (
    <View>
      {slide.bullets.map((bullet, index) => (
        <Bullet
          // biome-ignore lint/suspicious/noArrayIndexKey: a slide's bullets are positional
          key={index}
          bullet={bullet}
          size={size}
          slide={slide}
          last={index === slide.bullets.length - 1}
          measure={measure}
        />
      ))}
    </View>
  );
}

function Figures({ figures }: { figures: PitchFigure[] }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {figures.map((figure, index) => (
        <View
          key={figure.label}
          style={{
            width: figure.width,
            marginRight: index === figures.length - 1 ? 0 : frame.gap,
          }}
        >
          <View
            style={{
              height: frame.ruleWidth,
              backgroundColor: color.rule,
              marginBottom: frame.figureGap,
            }}
          />
          <Text
            style={{
              fontFamily: figure.valueFont.family === "mono" ? MONO : BODY,
              fontWeight: figure.valueFont.weight,
              fontSize: figure.valueFont.size,
              lineHeight: figure.valueLineHeight / figure.valueFont.size,
              color:
                figure.valueFont.family === "mono"
                  ? color.text
                  : color.textPlaceholder,
            }}
          >
            {figure.text}
          </Text>
          <Text
            style={{
              fontWeight: figure.labelFont.weight,
              fontSize: figure.labelFont.size,
              lineHeight: typography.figureLabel.lineHeight,
              color: color.textSecondary,
            }}
          >
            {figure.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Table({
  table,
  size,
}: {
  table: NonNullable<PitchSlide["table"]>;
  size: number;
}) {
  const { contentWidth } = pitchFrame(print);
  const cell = {
    paddingHorizontal: frame.cellPaddingX,
    paddingVertical: frame.cellPaddingY,
  };
  const row = {
    flexDirection: "row" as const,
    borderBottomWidth: frame.hairlineWidth,
    borderBottomColor: color.border,
  };
  return (
    <View style={{ backgroundColor: color.panel }}>
      <View style={{ ...row, backgroundColor: color.tableHeader }}>
        {table.columns.map((column) => (
          <Text
            key={column.label}
            style={{
              ...cell,
              width: column.width * contentWidth,
              fontSize: size,
              fontWeight: typography.figureLabel.fontWeight,
              lineHeight: typography.cell.lineHeight,
              textAlign: column.numeric ? "right" : "left",
            }}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {table.rows.length === 0 ? (
        <View style={row}>
          <Text
            style={{
              ...cell,
              width: contentWidth,
              fontSize: size,
              lineHeight: typography.cell.lineHeight,
              color: color.textPlaceholder,
            }}
          >
            {i18n.t("pitch:notWrittenYet")}
          </Text>
        </View>
      ) : (
        table.rows.map((cells, rowIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
          <View key={rowIndex} style={row}>
            {cells.map((value, columnIndex) => {
              const column = table.columns[columnIndex];
              if (column === undefined) {
                throw new Error("A cell without a column");
              }
              const { numeric } = column;
              // A blank cell holds no text: an empty one would be set in react-pdf's
              // default Helvetica.
              if (value === null) {
                return (
                  <View
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                    key={columnIndex}
                    style={{ ...cell, width: column.width * contentWidth }}
                  />
                );
              }
              return (
                <Text
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                  key={columnIndex}
                  style={{
                    ...cell,
                    width: column.width * contentWidth,
                    fontFamily: numeric ? MONO : BODY,
                    fontWeight: numeric
                      ? typography.cellNumber.fontWeight
                      : typography.cell.fontWeight,
                    fontSize: size,
                    lineHeight: typography.cell.lineHeight,
                    textAlign: numeric ? "right" : "left",
                  }}
                >
                  {value}
                </Text>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

function SlideBody({
  slide,
  options,
}: {
  slide: PitchSlide;
  options: PitchPdfOptions;
}) {
  const sizes = pitchSizes(slide.type, slide.shrink, print);
  const gap = <View style={{ height: frame.gap }} />;
  if (slide.type === "title") {
    return (
      <View style={KEEP_HEIGHT}>
        <Text
          style={{
            fontSize: sizes.heading,
            fontWeight: typography.title.fontWeight,
            lineHeight: typography.title.lineHeight,
            color: slide.title.empty ? color.textPlaceholder : color.text,
          }}
        >
          {slide.title.text}
        </Text>
        {slide.subtitle === null ? null : (
          <>
            {gap}
            <Text
              style={{
                fontSize: sizes.subtitle,
                fontWeight: typography.subtitle.fontWeight,
                lineHeight: typography.subtitle.lineHeight,
                color: slide.subtitle.empty
                  ? color.textPlaceholder
                  : color.textSecondary,
              }}
            >
              {slide.subtitle.text}
            </Text>
          </>
        )}
        {gap}
        <View
          style={{ height: frame.ruleWidth, backgroundColor: color.rule }}
        />
        {gap}
        <Bullets slide={slide} size={sizes.bullet} measure={options.measure} />
      </View>
    );
  }
  const figures = figureColumns(slide, sizes, {
    print,
    measure: options.measure,
    currency: options.currency,
  });
  return (
    <View style={UNBOUNDED}>
      <Text
        style={{
          fontSize: sizes.heading,
          fontWeight: typography.heading.fontWeight,
          lineHeight: typography.heading.lineHeight,
        }}
      >
        {slide.title.text}
      </Text>
      {gap}
      {figures.length === 0 ? null : (
        <>
          <Figures
            figures={figures.map((figure) =>
              // Long words break where the fit broke them: a reason's always, a
              // value's only once the figures do not fit (a value never breaks before).
              figures.fits && !figure.wraps
                ? figure
                : {
                    ...figure,
                    text: breakLongWords(
                      figure.text,
                      figure.valueFont,
                      figure.width,
                      options.measure,
                    ),
                  },
            )}
          />
          {slide.table === null ? null : gap}
        </>
      )}
      {slide.table === null ? null : (
        <Table table={slide.table} size={sizes.cell} />
      )}
      {slide.type !== "text" && slide.bullets.length > 0 ? gap : null}
      <Bullets slide={slide} size={sizes.bullet} measure={options.measure} />
    </View>
  );
}

function Footer({ deck, timeZone }: { deck: PitchDeck; timeZone: string }) {
  const parts = [
    deck.footer.businessName.trim(),
    deck.footer.versionLabel,
    formatDate(deck.footer.date, {
      timeZone,
      now: new Date(deck.generatedAt),
    }),
  ].filter((part) => part !== "");
  return (
    <Text
      style={{
        position: "absolute",
        left: frame.marginX,
        right: frame.marginX,
        bottom: frame.marginY,
        height: frame.footerHeight,
        fontSize: print.fontSize.footer,
        fontWeight: typography.footer.fontWeight,
        lineHeight: typography.footer.lineHeight,
        color: color.textSecondary,
      }}
    >
      {parts.join(i18n.t("pitch:footerSeparator"))}
    </Text>
  );
}

/** The PDF of `deck`, whose slides `fitPitchDeck` fitted. */
export function renderPitchPdf(
  deck: PitchDeck,
  options: PitchPdfOptions,
): Promise<Buffer> {
  const { bodyHeight, contentWidth } = pitchFrame(print);
  return renderToBuffer(
    <Document
      title={deck.businessName.trim() || undefined}
      creator="moonx"
      producer="moonx"
    >
      {deck.slides.map((slide) => (
        <Page
          key={slide.key}
          size={[frame.width, frame.height]}
          style={{
            backgroundColor: color.page,
            paddingHorizontal: frame.marginX,
            paddingVertical: frame.marginY,
            fontFamily: BODY,
            color: color.text,
          }}
        >
          {/* One page per slide: the body never breaks onto another page (a Page that
              does not wrap takes its content's height instead of the slide's). */}
          <View
            wrap={false}
            style={{
              width: contentWidth,
              height: bodyHeight,
              overflow: "hidden",
              justifyContent: slide.type === "title" ? "center" : "flex-start",
            }}
          >
            <SlideBody
              slide={breakSlideWords(slide, {
                print,
                measure: options.measure,
              })}
              options={options}
            />
          </View>
          <Footer deck={deck} timeZone={options.timeZone} />
        </Page>
      ))}
    </Document>,
  );
}
