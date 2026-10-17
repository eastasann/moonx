import {
  bulletGap,
  bulletTypography,
  fittedFigureColumns,
  pitchSizes,
} from "@moonx/domain";
import type { PitchSlide } from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { slideUnits } from "../internal/slideUnits";
import * as styles from "./Slide.css";

const { typography } = print;

export interface SlideProps {
  /** A slide of P12's deck, already fitted to the page (SDD 5.9 `PitchDeck`). */
  slide: PitchSlide;
  /** The footer on every slide: `pitchFooterText` of the deck. */
  footer: string;
  /** The workspace's currency, for the figures' amounts. */
  currency: string;
  /**
   * The level the slide's title takes in the page outline: 2 on a page whose h1 is
   * followed by the slides, 3 under a heading of their own (design-spec 4.5).
   * @default 3
   */
  headingLevel?: 2 | 3;
  /**
   * A thumbnail (23's list of slides): the white page without its own corners and shadow,
   * as the card around it frames it (design-spec 4.4・4.5).
   */
  isThumbnail?: boolean;
}

/**
 * A Pitch Deck slide on screen (23, design-spec 4.5・6.14): the PDF's page at the width of
 * its place, in the light colours at every theme, its text at the sizes and cut where the
 * fit set them. A slide that does not fit runs past its body and is cut there, as in the
 * PDF; telling the user is the screen's ("Too long for this slide…").
 */
export function Slide({
  slide,
  footer,
  currency,
  headingLevel = 3,
  isThumbnail = false,
}: SlideProps) {
  const { t } = useTranslation(["pitch"]);
  const headingId = useId();
  const sizes = pitchSizes(slide.type, slide.shrink, print);
  // The columns the API measured with the PDF's fonts: the browser's fonts and measure
  // could set them otherwise (ADR-012).
  const figures = fittedFigureColumns(slide, { print, currency });
  const Heading = `h${headingLevel}` as const;
  const u = slideUnits;
  const bulletType = bulletTypography(slide.type, print);

  const bullets =
    slide.bullets.length === 0 ? null : (
      <ul
        className={slide.type === "title" ? styles.meta : styles.bullets}
        // The title slide's three lines sit together, as the PDF sets them.
        style={{
          rowGap: slide.type === "title" ? 0 : u(bulletGap(slide.type, print)),
        }}
      >
        {slide.bullets.map((bullet, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: a slide's bullets are positional
            key={index}
            className={styles.bullet}
            style={{
              fontSize: u(sizes.bullet),
              fontWeight: bulletType.fontWeight,
              lineHeight: bulletType.lineHeight,
            }}
          >
            {slide.type !== "title" && (
              <span aria-hidden="true" className={styles.mark}>
                {t("pitch:bullet")}
              </span>
            )}
            <span className={styles.bulletText}>
              <span className={styles.label}>
                {t("pitch:label", { label: bullet.label })}
              </span>
              <span className={bullet.empty ? styles.placeholder : undefined}>
                {bullet.text}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <section
      aria-labelledby={headingId}
      className={`${styles.slide}${isThumbnail ? ` ${styles.thumbnail}` : ""}`}
    >
      <div className={styles.page}>
        <div
          className={slide.type === "title" ? styles.titleBody : styles.body}
        >
          {slide.type === "title" ? (
            <>
              <Heading
                id={headingId}
                className={`${styles.heading} ${slide.title.empty ? styles.placeholder : ""}`}
                style={{
                  fontSize: u(sizes.heading),
                  fontWeight: typography.title.fontWeight,
                  lineHeight: typography.title.lineHeight,
                }}
              >
                {slide.title.text}
              </Heading>
              {slide.subtitle !== null && (
                <p
                  className={
                    slide.subtitle.empty ? styles.placeholder : styles.subtitle
                  }
                  style={{
                    fontSize: u(sizes.subtitle),
                    fontWeight: typography.subtitle.fontWeight,
                    lineHeight: typography.subtitle.lineHeight,
                  }}
                >
                  {slide.subtitle.text}
                </p>
              )}
              <hr className={styles.rule} />
              {bullets}
            </>
          ) : (
            <>
              <Heading
                id={headingId}
                className={styles.heading}
                style={{
                  fontSize: u(sizes.heading),
                  fontWeight: typography.heading.fontWeight,
                  lineHeight: typography.heading.lineHeight,
                }}
              >
                {slide.title.text}
              </Heading>
              {figures.length > 0 && (
                <dl className={styles.figures}>
                  {figures.map((figure) => (
                    <div
                      key={figure.label}
                      className={styles.figure}
                      style={{ width: u(figure.width) }}
                    >
                      <dt
                        className={styles.figureLabel}
                        style={{
                          fontSize: u(figure.labelFont.size),
                          fontWeight: figure.labelFont.weight,
                          lineHeight: typography.figureLabel.lineHeight,
                        }}
                      >
                        {figure.label}
                      </dt>
                      <dd
                        className={
                          figure.valueFont.family === "mono"
                            ? figures.fits && !figure.wraps
                              ? styles.value
                              : styles.valueBreaking
                            : styles.reason
                        }
                        style={{
                          fontSize: u(figure.valueFont.size),
                          fontWeight: figure.valueFont.weight,
                          lineHeight:
                            figure.valueLineHeight / figure.valueFont.size,
                        }}
                      >
                        {figure.text}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {slide.table !== null && (
                <SlideTable table={slide.table} size={sizes.cell} />
              )}
              {bullets}
            </>
          )}
        </div>
        <p
          className={styles.footer}
          style={{
            fontSize: u(print.fontSize.footer),
            fontWeight: typography.footer.fontWeight,
            lineHeight: typography.footer.lineHeight,
          }}
        >
          {footer}
        </p>
      </div>
    </section>
  );
}

function SlideTable({
  table,
  size,
}: {
  table: NonNullable<PitchSlide["table"]>;
  size: number;
}) {
  const { t } = useTranslation(["pitch"]);
  const u = slideUnits;
  const font = { fontSize: u(size), lineHeight: typography.cell.lineHeight };
  return (
    <table className={styles.table}>
      <colgroup>
        {table.columns.map((column) => (
          <col key={column.label} style={{ width: `${column.width * 100}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr className={styles.tableHead}>
          {table.columns.map((column) => (
            <th
              key={column.label}
              scope="col"
              className={column.numeric ? styles.numericHead : styles.cell}
              style={{ ...font, fontWeight: typography.figureLabel.fontWeight }}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.length === 0 ? (
          <tr className={styles.tableRow}>
            <td
              colSpan={table.columns.length}
              className={`${styles.cell} ${styles.placeholder}`}
              style={font}
            >
              {t("pitch:notWrittenYet")}
            </td>
          </tr>
        ) : (
          table.rows.map((cells, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
            <tr key={rowIndex} className={styles.tableRow}>
              {cells.map((value, columnIndex) => {
                const numeric = table.columns[columnIndex]?.numeric ?? false;
                return (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                    key={columnIndex}
                    className={numeric ? styles.numericCell : styles.cell}
                    style={{
                      ...font,
                      fontWeight: numeric
                        ? typography.cellNumber.fontWeight
                        : typography.cell.fontWeight,
                    }}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
