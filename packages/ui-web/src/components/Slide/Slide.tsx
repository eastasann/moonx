import { type ReactNode, useId } from "react";
import {
  bullets as bulletsClass,
  canvas as canvasClass,
  cell,
  content,
  contentTitle,
  coverTitle,
  empty,
  figure,
  figureLabel,
  figures,
  figureValue,
  footer as footerClass,
  footerMeta,
  frame,
  headCell,
  heading,
  notes as notesClass,
  notice,
  rule,
  subtitle as subtitleClass,
  table,
  wrapper,
} from "./Slide.css";
import { useSlideScale } from "./useSlideScale";

export interface SlideBullet {
  text: string;
  /** The source is empty; `text` is ignored and `emptyLabel` is shown in gray. */
  isEmpty?: boolean;
}

export interface SlideFigure {
  label: string;
  /** Already formatted by the screen (currency, percent). Null shows `emptyLabel`. */
  value: string | null;
}

export interface SlideFooter {
  businessName: string;
  /** Version name, or "Draft". */
  versionLabel: string;
  date: string;
}

interface SlideBase {
  title: string;
  footer: SlideFooter;
  /** Text for empty sources ("Not written yet"). */
  emptyLabel: string;
  /** Shown under the slide, outside it, when the text was cut ("Too long for this slide"). */
  overflowNotice?: ReactNode;
}

/** Cover: large title and subtitle. */
export interface TitleSlideProps extends SlideBase {
  type: "title";
  subtitle?: string | null;
}

/** Heading and one to four bullets. */
export interface TextSlideProps extends SlideBase {
  type: "text";
  bullets: readonly SlideBullet[];
}

/** Heading and two to four large figures, with optional notes below. */
export interface NumberSlideProps extends SlideBase {
  type: "number";
  figures: readonly SlideFigure[];
  notes?: readonly SlideBullet[];
}

/** Heading and a table, with optional notes below. */
export interface TableSlideProps extends SlideBase {
  type: "table";
  columns: readonly string[];
  rows: readonly (readonly (string | null)[])[];
  notes?: readonly SlideBullet[];
}

export type SlideProps = TitleSlideProps | TextSlideProps | NumberSlideProps | TableSlideProps;

function Bullets({
  items,
  emptyLabel,
  className,
}: {
  items: readonly SlideBullet[];
  emptyLabel: string;
  className: string;
}) {
  return (
    <ul className={className}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: bullets have no stable id
        <li key={index} className={item.isEmpty ? empty : undefined}>
          {item.isEmpty ? emptyLabel : item.text}
        </li>
      ))}
    </ul>
  );
}

function Body(props: SlideProps) {
  switch (props.type) {
    case "title":
      return (
        <>
          <div className={rule} aria-hidden />
          {props.subtitle ? <p className={subtitleClass}>{props.subtitle}</p> : null}
        </>
      );
    case "text":
      return (
        <Bullets items={props.bullets} emptyLabel={props.emptyLabel} className={bulletsClass} />
      );
    case "number":
      return (
        <>
          <dl className={figures}>
            {props.figures.map((item) => (
              <div key={item.label} className={figure}>
                <dt className={figureLabel}>{item.label}</dt>
                <dd className={item.value === null ? `${figureValue} ${empty}` : figureValue}>
                  {item.value ?? props.emptyLabel}
                </dd>
              </div>
            ))}
          </dl>
          {props.notes?.length ? (
            <Bullets items={props.notes} emptyLabel={props.emptyLabel} className={notesClass} />
          ) : null}
        </>
      );
    case "table":
      return (
        <>
          <table className={table}>
            <thead>
              <tr>
                {props.columns.map((column) => (
                  <th key={column} scope="col" className={headCell}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, rowIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: table rows have no stable id
                <tr key={rowIndex}>
                  {row.map((value, columnIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                    <td key={columnIndex} className={value === null ? `${cell} ${empty}` : cell}>
                      {value ?? props.emptyLabel}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {props.notes?.length ? (
            <Bullets items={props.notes} emptyLabel={props.emptyLabel} className={notesClass} />
          ) : null}
        </>
      );
  }
}

/**
 * One Pitch Deck slide (design-spec 6.14) in one of four types. It is 16:9, is drawn at the
 * `print.slide` size and scaled to the width of its container, and it reads the same print tokens as the PDF
 * (always light). Text that does not
 * fit is clipped; shrinking and cutting with an ellipsis happen when the deck is assembled.
 */
export function Slide(props: SlideProps) {
  const titleId = useId();
  const { frameRef, canvasRef, scale } = useSlideScale<HTMLDivElement, HTMLDivElement>();
  const isCover = props.type === "title";
  return (
    <section className={wrapper} aria-labelledby={titleId}>
      <div ref={frameRef} className={frame} data-slide-type={props.type}>
        <div ref={canvasRef} className={canvasClass} style={{ transform: `scale(${scale})` }}>
          <div className={isCover ? `${content} ${contentTitle}` : content}>
            <h3 id={titleId} className={isCover ? `${heading} ${coverTitle}` : heading}>
              {props.title}
            </h3>
            <Body {...props} />
          </div>
          <div className={footerClass}>
            <span>{props.footer.businessName}</span>
            <span className={footerMeta}>
              <span>{props.footer.versionLabel}</span>
              <span>{props.footer.date}</span>
            </span>
          </div>
        </div>
      </div>
      {props.overflowNotice ? <p className={notice}>{props.overflowNotice}</p> : null}
    </section>
  );
}
