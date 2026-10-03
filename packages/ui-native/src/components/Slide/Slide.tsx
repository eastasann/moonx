import { fontFamily } from "@moonx/ui-tokens/native";
import { print } from "@moonx/ui-tokens/print";
import { type ReactNode, useId, useState } from "react";
import {
  type LayoutChangeEvent,
  Text as NativeText,
  type TextProps as NativeTextProps,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { fontStyle } from "../../internal/typography";

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
  style,
}: {
  items: readonly SlideBullet[];
  emptyLabel: string;
  style: "bullets" | "notes";
}) {
  return (
    <View role="list" style={styles[style]}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: bullets have no stable id
        <View key={index} role="listitem" style={styles.bullet}>
          <SlideText aria-hidden style={styles[`${style}Text`]}>
            •
          </SlideText>
          <SlideText style={[styles[`${style}Text`], item.isEmpty ? styles.empty : null]}>
            {item.isEmpty ? emptyLabel : item.text}
          </SlideText>
        </View>
      ))}
    </View>
  );
}

function Body(props: SlideProps) {
  switch (props.type) {
    case "title":
      return (
        <>
          <View aria-hidden style={styles.rule} />
          {props.subtitle ? <SlideText style={styles.subtitle}>{props.subtitle}</SlideText> : null}
        </>
      );
    case "text":
      return <Bullets items={props.bullets} emptyLabel={props.emptyLabel} style="bullets" />;
    case "number":
      return (
        <>
          <View style={styles.figures}>
            {props.figures.map((item, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a static list; labels may repeat
              <View key={`${index}-${item.label}`} accessible style={styles.figure}>
                <SlideText style={styles.figureLabel}>{item.label}</SlideText>
                <SlideText style={[styles.figureValue, item.value === null ? styles.empty : null]}>
                  {item.value ?? props.emptyLabel}
                </SlideText>
              </View>
            ))}
          </View>
          {props.notes?.length ? (
            <Bullets items={props.notes} emptyLabel={props.emptyLabel} style="notes" />
          ) : null}
        </>
      );
    case "table":
      return (
        <>
          <View role="table" style={styles.table}>
            <View role="row" style={styles.row}>
              {props.columns.map((column, columnIndex) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: a static list; labels may repeat
                  key={`${columnIndex}-${column}`}
                  role="columnheader"
                  style={[styles.cell, styles.headCell]}
                >
                  <SlideText style={styles.cellText}>{column}</SlideText>
                </View>
              ))}
            </View>
            {props.rows.map((row, rowIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: table rows have no stable id
              <View key={rowIndex} role="row" style={styles.row}>
                {row.map((value, columnIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                  <View key={columnIndex} role="cell" style={[styles.cell, styles.bodyCell]}>
                    <SlideText style={[styles.cellText, value === null ? styles.empty : null]}>
                      {value ?? props.emptyLabel}
                    </SlideText>
                  </View>
                ))}
              </View>
            ))}
          </View>
          {props.notes?.length ? (
            <Bullets items={props.notes} emptyLabel={props.emptyLabel} style="notes" />
          ) : null}
        </>
      );
  }
}

/**
 * One Pitch Deck slide (design-spec 6.14) in one of four types. It is 16:9, is drawn at the
 * `print.slide` size and scaled to the width of its container, and it reads the same print
 * tokens as the PDF, so it stays light in the dark theme. Text that does not fit is clipped;
 * shrinking and cutting with an ellipsis happen when the deck is assembled. The body face is the
 * phone's system sans-serif, not the PDF's Noto Sans, because the app does not bundle it.
 */
/** The slide is a fixed 16:9 canvas that is scaled to fit; OS font scaling would overflow it. */
function SlideText(props: NativeTextProps) {
  return <NativeText allowFontScaling={false} {...props} />;
}

export function Slide(props: SlideProps) {
  const titleId = useId();
  const [scale, setScale] = useState<number | null>(null);
  const isCover = props.type === "title";
  styles.useVariants({ measured: scale !== null });

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setScale(width / print.slide.width);
  };

  return (
    <View role="region" aria-label={props.title} aria-labelledby={titleId} style={styles.wrapper}>
      <View onLayout={onLayout} testID={`slide-${props.type}`} style={styles.frame}>
        <View style={styles.canvas(scale ?? 1)}>
          <View style={[styles.content, isCover ? styles.contentTitle : null]}>
            <SlideText
              role="heading"
              aria-level={3}
              nativeID={titleId}
              style={isCover ? styles.coverTitle : styles.heading}
            >
              {props.title}
            </SlideText>
            <Body {...props} />
          </View>
          <View style={styles.footer}>
            <SlideText style={styles.footerText}>{props.footer.businessName}</SlideText>
            <View style={styles.footerMeta}>
              <SlideText style={styles.footerText}>{props.footer.versionLabel}</SlideText>
              <SlideText style={styles.footerText}>{props.footer.date}</SlideText>
            </View>
          </View>
        </View>
      </View>
      {props.overflowNotice ? (
        <SlideText style={styles.notice}>{props.overflowNotice}</SlideText>
      ) : null}
    </View>
  );
}

type PrintType = (typeof print.typography)[keyof typeof print.typography];

/** Print line heights are ratios, React Native wants pixels. */
function type(t: PrintType) {
  const numeric = "fontVariantNumeric" in t && t.fontVariantNumeric === "tabular-nums";
  return {
    fontSize: t.fontSize,
    fontWeight: String(t.fontWeight) as "400",
    letterSpacing: t.letterSpacing,
    lineHeight: Math.round(t.fontSize * t.lineHeight),
    ...(t.fontFamily[0] === print.font.display[0] ? { fontFamily: fontFamily.display } : {}),
    ...(numeric ? { fontVariant: ["tabular-nums" as const] } : {}),
  };
}

const styles = StyleSheet.create((theme) => {
  const { color, slide, typography } = print;
  const hairline = theme["border-width"].hairline;
  return {
    wrapper: { gap: theme.space["100"] },
    // Keeps 16:9 at any width; the canvas inside is drawn at the reference size and scaled down.
    frame: {
      width: "100%",
      aspectRatio: slide.width / slide.height,
      overflow: "hidden",
      backgroundColor: color.page,
      borderWidth: hairline,
      borderColor: color.border,
      borderRadius: theme.radius.chip,
    },
    canvas: (scale: number) => ({
      position: "absolute",
      top: 0,
      left: 0,
      width: slide.width,
      height: slide.height,
      paddingHorizontal: slide["margin-x"],
      paddingVertical: slide["margin-y"],
      gap: slide.gap,
      backgroundColor: color.page,
      transformOrigin: "top left",
      transform: [{ scale }],
      variants: { measured: { true: { opacity: 1 }, false: { opacity: 0 } } },
    }),
    content: { flex: 1, minHeight: 0, overflow: "hidden", gap: slide.gap },
    contentTitle: { justifyContent: "center" },
    coverTitle: { ...type(typography.title), color: color.text },
    heading: { ...type(typography.heading), color: color.text },
    rule: { width: theme.space["800"], height: theme.space["75"], backgroundColor: color.accent },
    subtitle: { ...type(typography.subtitle), color: color["text-secondary"] },
    bullets: { gap: theme.space["200"] },
    bulletsText: { ...type(typography.bullet), color: color.text },
    notes: { gap: theme.space["100"] },
    notesText: { ...type(typography.cell), color: color["text-secondary"] },
    bullet: { flexDirection: "row", gap: theme.space["100"] },
    empty: { color: color["text-placeholder"] },
    figures: { flexDirection: "row", gap: slide.gap },
    // The label comes first for assistive technology, the value is drawn above it.
    figure: {
      flex: 1,
      minWidth: 0,
      flexDirection: "column-reverse",
      justifyContent: "flex-end",
      gap: theme.space["100"],
      padding: slide.gap,
      backgroundColor: color.panel,
      borderWidth: hairline,
      borderColor: color.border,
      borderRadius: theme.radius.card,
    },
    figureValue: { ...type(typography.figure), color: color.text },
    figureLabel: { ...type(typography["figure-label"]), color: color["text-secondary"] },
    table: { width: "100%" },
    row: { flexDirection: "row" },
    cell: { flex: 1, minWidth: 0, padding: theme.space["100"] },
    headCell: {
      backgroundColor: color["table-header"],
      borderBottomWidth: theme["border-width"].strong,
      borderBottomColor: color["border-strong"],
    },
    bodyCell: { borderBottomWidth: hairline, borderBottomColor: color.border },
    cellText: { ...type(typography.cell), color: color.text },
    footer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: slide.gap,
      height: slide["footer-height"],
      flexShrink: 0,
    },
    footerText: { ...type(typography.footer), color: color["text-secondary"] },
    footerMeta: { flexDirection: "row", gap: theme.space["200"] },
    notice: {
      ...fontStyle(theme, "body-sm"),
      color: theme.color.notice.fg,
    },
  };
});
