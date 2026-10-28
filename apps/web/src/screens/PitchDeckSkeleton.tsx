import { pitchSlideKeys } from "@moonx/domain";
import { i18n } from "@moonx/i18n";
import {
  type PitchSlide,
  type PitchSlideKey,
  type PitchVariant,
  pitchVariantSchema,
} from "@moonx/schemas";
import {
  Heading,
  PresentationPattern,
  type PresentationSlide,
  Skeleton,
  Slide,
  Text,
} from "@moonx/ui-web";
import { useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/** The deck a URL without `variant` opens. */
export const DEFAULT_VARIANT: PitchVariant = "one";

/** A slide with nothing on it: the white page the skeleton draws. */
const blankSlide = (key: PitchSlideKey): PitchSlide => ({
  key,
  type: "text",
  title: { text: "", empty: false },
  subtitle: null,
  bullets: [],
  numbers: [],
  figureColumns: null,
  table: null,
  emptySources: [],
  shrink: 0,
  overflow: false,
  editSource: null,
  editInValidation: null,
  commentCount: 0,
});

/**
 * A blank page of the skeleton: it has no figures, so no amounts for a currency to
 * write, and no footer yet.
 */
export function BlankSlide({
  slideKey,
  isThumbnail = false,
}: {
  slideKey: PitchSlideKey;
  isThumbnail?: boolean;
}) {
  return (
    <Slide
      slide={blankSlide(slideKey)}
      footer=""
      currency=""
      headingLevel={2}
      isThumbnail={isThumbnail}
    />
  );
}

/** What to say on its way: its heading and a line, drawn as bars by the skeleton. */
export function NotesSkeleton() {
  const { t } = useTranslation(["plans", "pitch"]);
  return (
    <>
      <Heading level={2} variant="label">
        {t("plans:pitch.whatToSay")}
      </Heading>
      <Text variant="body-long" elementType="p">
        {t("pitch:notWrittenYet")}
      </Text>
    </>
  );
}

/** The thumbnails of a deck on its way: blank pages under the slides' names. */
export const skeletonSlides = (variant: PitchVariant): PresentationSlide[] =>
  pitchSlideKeys(variant).map((key) => ({
    id: key,
    title: i18n.t(`pitch:slide.${key}`),
    thumbnail: <BlankSlide slideKey={key} isThumbnail />,
  }));

/**
 * 23's shape while it loads (design-spec 6.0.6): the title, and the blank slides of the
 * deck the URL asks for, with What to say under them. Drawn inside a `Skeleton`.
 */
export function PitchDeckSkeleton({ variant }: { variant: PitchVariant }) {
  const { t } = useTranslation(["plans"]);
  return (
    <Skeleton isLoading>
      <PresentationPattern
        header={
          <Heading level={1} variant="heading-1-toolbar">
            {t("plans:pitch.title")}
          </Heading>
        }
        slides={skeletonSlides(variant)}
        currentId="title"
        onCurrentChange={() => {}}
        slide={<BlankSlide slideKey="title" />}
        notes={<NotesSkeleton />}
      />
    </Skeleton>
  );
}

/** 23's skeleton while its route loads: of the length its URL names. */
export function PitchDeckRouteSkeleton() {
  const search = useSearch({ strict: false }) as { variant?: unknown };
  return (
    <PitchDeckSkeleton
      variant={
        pitchVariantSchema.safeParse(search.variant).data ?? DEFAULT_VARIANT
      }
    />
  );
}
