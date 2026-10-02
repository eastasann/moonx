import { formatKeyMetric, slideFontSizes } from "@moonx/domain";
import type { PitchDeck, PitchSlide } from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { i18n } from "../lib/i18n";
import { registerPdfFonts } from "./fonts";

const { color, slide: layout, font } = print;
const DISPLAY = [...font.display];
const BODY = [...font.body];
const CONTENT_HEIGHT =
  layout.height - 2 * layout["margin-y"] - layout["footer-height"] - layout.gap;
const CELL_PAD_X = (layout.gap * 2) / 3;
const CELL_PAD_Y = layout.gap / 3;

const styles = StyleSheet.create({
  page: { backgroundColor: color.page, color: color.text, fontFamily: BODY },
  content: {
    position: "absolute",
    left: layout["margin-x"],
    top: layout["margin-y"],
    width: layout.width - 2 * layout["margin-x"],
    height: CONTENT_HEIGHT,
  },
  footer: {
    position: "absolute",
    left: layout["margin-x"],
    right: layout["margin-x"],
    bottom: layout["margin-y"] - layout["footer-height"] / 2,
    height: layout["footer-height"],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    fontFamily: BODY,
    fontSize: print["font-size"].footer,
    color: color["text-secondary"],
  },
});

const Bullets = ({ slide, size, marker }: { slide: PitchSlide; size: number; marker: boolean }) => (
  <View style={{ marginTop: layout.gap }}>
    {(slide.bullets ?? []).map((bullet, index) => (
      <View
        // biome-ignore lint/suspicious/noArrayIndexKey: bullets are a fixed ordered list
        key={index}
        style={{ flexDirection: "row", marginTop: index === 0 ? 0 : layout.gap / 2 }}
      >
        {marker ? (
          <Text style={{ width: layout.gap, fontSize: size, lineHeight: 1.35 }}>•</Text>
        ) : null}
        <Text
          style={{
            flex: 1,
            fontSize: size,
            lineHeight: 1.35,
            color: bullet.empty ? color["text-placeholder"] : color.text,
          }}
        >
          {bullet.text}
        </Text>
      </View>
    ))}
  </View>
);

function Heading({ slide, size }: { slide: PitchSlide; size: number }) {
  return (
    <Text style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: size, lineHeight: 1.25 }}>
      {slide.title}
    </Text>
  );
}

function TitleSlide({ slide }: { slide: PitchSlide }) {
  const sizes = slideFontSizes(slide);
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <View
        style={{
          width: 64,
          height: 4,
          backgroundColor: color.accent,
          marginBottom: layout.gap,
        }}
      />
      <Heading slide={slide} size={sizes.heading} />
      {slide.subtitle ? (
        <Text
          style={{
            marginTop: layout.gap / 2,
            fontSize: sizes.body,
            lineHeight: 1.35,
            color:
              slide.emptySources.length > 0 && !slide.subtitle
                ? color["text-placeholder"]
                : color["text-secondary"],
          }}
        >
          {slide.subtitle}
        </Text>
      ) : null}
      {slide.bullets?.length ? <Bullets slide={slide} size={sizes.body} marker={false} /> : null}
    </View>
  );
}

function TextSlide({ slide }: { slide: PitchSlide }) {
  const sizes = slideFontSizes(slide);
  return (
    <View>
      <Heading slide={slide} size={sizes.heading} />
      <Bullets slide={slide} size={sizes.body} marker />
    </View>
  );
}

function NumberSlide({ slide, currency }: { slide: PitchSlide; currency: string }) {
  const sizes = slideFontSizes(slide);
  const numbers = slide.numbers ?? [];
  const columns = Math.min(2, Math.max(1, numbers.length));
  const width = (layout.width - 2 * layout["margin-x"] - (columns - 1) * layout.gap) / columns;
  return (
    <View>
      <Heading slide={slide} size={sizes.heading} />
      <View
        style={{ marginTop: layout.gap, flexDirection: "row", flexWrap: "wrap", gap: layout.gap }}
      >
        {numbers.map((item) => (
          <View
            key={item.metricKey + item.label}
            style={{
              width,
              backgroundColor: color.panel,
              borderWidth: 1,
              borderColor: color.border,
              padding: layout.gap / 2,
            }}
          >
            <Text
              style={{
                fontFamily: BODY,
                fontWeight: 600,
                fontSize: sizes.figure,
                lineHeight: 1.25,
              }}
            >
              {formatKeyMetric(item.metricKey, item.value, currency)}
            </Text>
            <Text
              style={{
                fontWeight: 500,
                fontSize: sizes.figureLabel,
                lineHeight: 1.35,
                color: color["text-secondary"],
              }}
            >
              {item.label}
            </Text>
          </View>
        ))}
      </View>
      {slide.bullets?.length ? <Bullets slide={slide} size={sizes.body} marker /> : null}
    </View>
  );
}

function TableSlide({ slide }: { slide: PitchSlide }) {
  const sizes = slideFontSizes(slide);
  const table = slide.table ?? { columns: [], rows: [] };
  const cell = (text: string | null, key: string, header: boolean) => (
    <View
      key={key}
      style={{
        flex: 1,
        paddingHorizontal: CELL_PAD_X / 2,
        paddingVertical: CELL_PAD_Y / 2,
      }}
    >
      <Text
        style={{
          fontSize: sizes.cell,
          lineHeight: 1.35,
          fontWeight: header ? 600 : 400,
          color: text == null ? color["text-placeholder"] : color.text,
        }}
      >
        {text ?? "—"}
      </Text>
    </View>
  );
  return (
    <View>
      <Heading slide={slide} size={sizes.heading} />
      <View style={{ marginTop: layout.gap }}>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: color["table-header"],
            borderBottomWidth: 1,
            borderBottomColor: color["border-strong"],
          }}
        >
          {table.columns.map((name, i) => cell(name, `h${i}`, true))}
        </View>
        {table.rows.map((row, r) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are a fixed ordered list
            key={r}
            wrap={false}
            style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: color.border }}
          >
            {row.map((text, c) => cell(text, `${r}-${c}`, false))}
          </View>
        ))}
      </View>
      {slide.bullets?.length ? <Bullets slide={slide} size={sizes.body} marker={false} /> : null}
    </View>
  );
}

function SlideBody({ slide, currency }: { slide: PitchSlide; currency: string }) {
  switch (slide.type) {
    case "title":
      return <TitleSlide slide={slide} />;
    case "text":
      return <TextSlide slide={slide} />;
    case "number":
      return <NumberSlide slide={slide} currency={currency} />;
    case "table":
      return <TableSlide slide={slide} />;
  }
}

/**
 * The Pitch Deck as a 16:9 PDF, always in the light colors (design-spec 6.14). One page per slide,
 * 960 × 540 pt, with Business Name, version label and date in the footer. Fonts are the ones of
 * the print tokens and only the glyphs used are embedded (ADR-012). react-pdf has no
 * `font-variant-numeric`; the tokens' tabular figures hold because the default digits of Noto
 * Sans (the first print family, used for every cell and figure) are tabular.
 */
export async function renderPitchDeckPdf(
  deck: PitchDeck,
  currency: string,
): Promise<Uint8Array<ArrayBuffer>> {
  registerPdfFonts();
  const document = (
    <Document
      title={`${deck.businessName} (${i18n.t("common:pitchDeck")})`}
      creator="moonx"
      producer="moonx"
    >
      {deck.slides.map((slide) => (
        <Page key={slide.key} size={[layout.width, layout.height]} style={styles.page}>
          <View style={styles.content}>
            <SlideBody slide={slide} currency={currency} />
          </View>
          <View style={styles.footer} fixed>
            <Text>{deck.footer.businessName}</Text>
            <Text>{deck.footer.versionLabel}</Text>
            <Text>{deck.footer.date}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
  return new Uint8Array(await renderToBuffer(document));
}
