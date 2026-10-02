import { formatKeyMetric } from "@moonx/domain";
import { formatDate } from "@moonx/i18n";
import type { PitchDeck, PitchSlide } from "@moonx/schemas";
import type { SlideProps } from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { ApiError, fromEnvelope } from "./api-error";

/** The comment target key of a slide: the deck length and the slide key (SDD 5.1), e.g. `five.market`. */
export const slideTargetKey = (variant: PitchDeck["variant"], slideKey: string) =>
  `${variant}.${slideKey}`;

/** The element id the thumbnail list scrolls to. */
export const slideAnchorId = (slideKey: string) => `pitch-slide-${slideKey}`;

/** Where "Edit in validation" of a slide goes: costs (screen 17) or economics (screen 18). */
export function validationPath(
  workspaceId: string,
  ideaId: string,
  target: NonNullable<PitchSlide["editInValidation"]>,
): string {
  return `/w/${workspaceId}/ideas/${ideaId}/${target}`;
}

/**
 * The props of `Slide` for one slide of the deck. Numbers are formatted here with the workspace
 * currency; a number that cannot be computed shows the empty label. Titles and texts come from
 * the API deck untouched.
 */
export function slideProps(
  t: TFunction,
  deck: PitchDeck,
  slide: PitchSlide,
  currency: string,
  timeZone: string,
): SlideProps {
  const base = {
    title: slide.title,
    footer: {
      businessName: deck.footer.businessName,
      versionLabel: deck.footer.versionLabel,
      date: formatDate(deck.footer.date, timeZone),
    },
    emptyLabel: t("pitch:empty"),
    overflowNotice: slide.overflow ? t("pitch:overflow") : undefined,
  };
  const bullets = (slide.bullets ?? []).map((b) => ({ text: b.text, isEmpty: b.empty }));
  switch (slide.type) {
    case "title":
      return { ...base, type: "title", subtitle: slide.subtitle ?? null };
    case "text":
      return { ...base, type: "text", bullets };
    case "number":
      return {
        ...base,
        type: "number",
        figures: (slide.numbers ?? []).map((n) => ({
          label: n.label,
          value: n.value.value == null ? null : formatKeyMetric(n.metricKey, n.value, currency),
        })),
        notes: bullets,
      };
    case "table":
      return {
        ...base,
        type: "table",
        columns: slide.table?.columns ?? [],
        rows: slide.table?.rows ?? [],
        notes: bullets,
      };
  }
}

/** The file name a `Content-Disposition` header carries; `filename*` (UTF-8) wins over `filename`. */
export function fileNameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      // A malformed escape: the plain `filename` below is the fallback.
    }
  }
  return /filename\s*=\s*"([^"]*)"/i.exec(disposition)?.[1] ?? null;
}

/** How long the PDF may take to render before the request ends. */
const PDF_TIMEOUT_MS = 60_000;

/**
 * P13: the PDF as a Blob and the name the server gave it. `sendJson` parses JSON, so this reads
 * the body itself; a refusal still arrives as the API's error envelope.
 */
export async function fetchPitchPdf(url: string): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await globalThis.fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { "X-Moonx-Client": "web" },
      signal: AbortSignal.timeout(PDF_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ApiError("NETWORK", 0, error instanceof Error ? error.message : "Network error");
  }
  if (!response.ok) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await response.text());
    } catch {
      // A gateway's HTML page: `fromEnvelope` reads a body without an envelope by its status.
    }
    throw fromEnvelope(response.status, parsed);
  }
  const blob = await response.blob();
  return {
    blob,
    fileName: fileNameOf(response.headers.get("content-disposition")) ?? "pitch-deck.pdf",
  };
}

/**
 * Hands a Blob to the browser as a file download. The object URL is released a few seconds
 * later because Safari and Firefox can still be reading it after the click returns.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
