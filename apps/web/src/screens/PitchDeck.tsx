import { pitchFooterText, pitchSlideKeys } from "@moonx/domain";
import { i18n } from "@moonx/i18n";
import {
  type PitchDeck,
  type PitchSlide,
  type PitchSlideKey,
  type PitchVariant,
  type PlanHome,
  pitchVariantSchema,
  type TargetRef,
} from "@moonx/schemas";
import {
  Breadcrumb,
  Breadcrumbs,
  Button,
  Flex,
  Heading,
  InlineAlert,
  Link,
  Picker,
  PresentationPattern,
  type PresentationSlide,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  Slide,
  Text,
} from "@moonx/ui-web";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import { rateLimitWords } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  reportOnce,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, usePanel, useWorkspace } from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { attachmentName, downloadBlob } from "../lib/files";
import {
  costsHref,
  economicsHref,
  ideaHref,
  ideasHref,
  type PitchSearch,
  pitchHref,
  pitchVariantOf,
  planHref,
  planItemHref,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  pitchDeckQuery,
  pitchKey,
  planHomeQuery,
  validationHomeQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

export type { PitchSearch };

/** The Picker's value for the plan as it is now (6.14 "Latest"). */
const LATEST = "latest";

/** The deck a URL without `variant` opens. */
const DEFAULT_VARIANT: PitchVariant = "one";

/** A slide's name: its type's ("Business model"); the title slide's is "Title". */
const slideName = (slide: Pick<PitchSlide, "type" | "title">) =>
  slide.type === "title" ? i18n.t("pitch:slide.title") : slide.title.text;

/** The comment target of a slide of the deck (SDD 5.1: `{variant}.{key}`). */
const slideTarget = (
  planId: string,
  variant: PitchVariant,
  key: PitchSlideKey,
): TargetRef => ({ type: "pitch_slide", id: planId, key: `${variant}.${key}` });

/** The deck and slide a slide's comment target names, when it is a slide of the plan. */
function slideOf(
  target: TargetRef,
  planId: string,
): { variant: PitchVariant; key: PitchSlideKey } | undefined {
  const variant = pitchVariantOf(target);
  if (variant === undefined || target.id !== planId) return undefined;
  const [, key, ...rest] = (target.key ?? "").split(".");
  const known = pitchSlideKeys(variant).find((slide) => slide === key);
  return known === undefined || rest.length > 0
    ? undefined
    : { variant, key: known };
}

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
function BlankSlide({
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
function NotesSkeleton() {
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
const skeletonSlides = (variant: PitchVariant): PresentationSlide[] =>
  pitchSlideKeys(variant).map((key) => ({
    id: key,
    title: i18n.t(`pitch:slide.${key}`),
    thumbnail: <BlankSlide slideKey={key} isThumbnail />,
  }));

/** The length and the version the deck is made from (6.14), at the start of the tools' line. */
function DeckTools({
  home,
  search,
  onSearch,
}: {
  home: PlanHome;
  search: PitchSearch;
  onSearch: (next: PitchSearch) => void;
}) {
  const { t } = useTranslation(["plans"]);
  return (
    <>
      <SegmentedControl
        aria-label={t("plans:pitch.length")}
        selectedKey={search.variant ?? DEFAULT_VARIANT}
        onSelectionChange={(key) =>
          onSearch({
            ...search,
            variant: pitchVariantSchema.safeParse(key).data,
          })
        }
      >
        <SegmentedControlItem id="one">
          {t("plans:pitch.one")}
        </SegmentedControlItem>
        <SegmentedControlItem id="five">
          {t("plans:pitch.five")}
        </SegmentedControlItem>
      </SegmentedControl>
      <Picker
        label={t("plans:pitch.from")}
        labelPosition="inside"
        items={[
          { id: LATEST, label: t("plans:pitch.latest") },
          ...home.versions.map(({ id, name }) => ({ id, label: name })),
        ]}
        value={search.version ?? LATEST}
        onChange={(value) =>
          onSearch({
            ...search,
            version: value === null || value === LATEST ? undefined : value,
          })
        }
      />
    </>
  );
}

/** What the PDF was asked for: a failure shows only while the same deck is open. */
interface PdfRequest {
  variant: PitchVariant;
  versionId: string | undefined;
}

/**
 * P13's failure, above the slide (6.14 "失敗したら再試行", 6.0.6): the rate limit's
 * wait, or the `Ref` of an unexpected failure, and Retry.
 */
function PdfFailure({
  error,
  onRetry,
  isRetryDisabled,
}: {
  error: unknown;
  onRetry: () => void;
  isRetryDisabled: boolean;
}) {
  const { t } = useTranslation(["plans", "app"]);
  const rateLimited = rateLimitWords(error);
  // The network fails without a request to quote; anything else is unexpected (8.2).
  const reference = useMemo(
    () =>
      rateLimited !== null
        ? null
        : error instanceof ApiError
          ? error.requestId
          : reportOnce(error),
    [rateLimited, error],
  );
  return (
    <InlineAlert variant="negative" title={t("plans:pitch.pdfFailed")}>
      <Flex gap="space-200" wrap alignItems="center">
        <Text>{rateLimited ?? t("app:state.unexpected")}</Text>
        {reference !== null && (
          <Text variant="caption" tone="secondary">
            {t("app:state.ref", { ref: reference.slice(0, 8) })}
          </Text>
        )}
        <Button
          variant="secondary"
          size="S"
          onPress={onRetry}
          isDisabled={isRetryDisabled}
        >
          {t("app:state.retry")}
        </Button>
      </Flex>
    </InlineAlert>
  );
}

/** Asks P13 for the deck's PDF and saves it under the name the API gives it. */
async function downloadPdf(planId: string, { variant, versionId }: PdfRequest) {
  const pending = api()
    .api.v1.plans({ planId: inPath(planId) })
    ["pitch-deck.pdf"].get({
      query: versionId === undefined ? { variant } : { variant, versionId },
    });
  const pdf: unknown = await unwrap(pending);
  if (!(pdf instanceof Blob)) {
    throw new Error("P13 answered with no PDF");
  }
  const { response } = await pending;
  downloadBlob(
    attachmentName(response?.headers.get("content-disposition") ?? null) ??
      `${i18n.t("plans:pitch.title")}.pdf`,
    pdf,
  );
}

/**
 * The deck on 23 (6.14), pattern I: the tools' line, the thumbnails and the slide on
 * screen with its links and 💬, What to say under it. While the chosen length or version
 * is on its way, the tools stay and the rest is its skeleton.
 */
function DeckBody({
  home,
  ideaId,
  planId,
  search,
  onSearch,
}: {
  home: PlanHome;
  ideaId: string;
  /** The plan of the URL, as the panels and their counts name it. */
  planId: string;
  search: PitchSearch;
  onSearch: (next: PitchSearch) => void;
}) {
  const { t } = useTranslation(["plans", "pitch"]);
  const { me, workspace } = useWorkspace();
  const panel = usePanel();
  const isOnline = useIsOnline();
  const downloadId = useId();
  const variant = search.variant ?? DEFAULT_VARIANT;
  const versionId = search.version;
  const deck = useQuery(pitchDeckQuery(ideaId, planId, variant, versionId));
  const isSlow = useIsSlow(deck.isPending);
  // A link to a slide's comment opens on that slide; otherwise the first.
  const [current, setCurrent] = useState<PitchSlideKey | null>(() => {
    const open = panel.open?.target;
    const named =
      open?.kind === "item" ? slideOf(open.item, planId) : undefined;
    return named?.variant === variant ? named.key : null;
  });
  // The slide on screen: the one chosen while this deck has it, else the title slide.
  // Switching keeps it as the one chosen (6.14).
  const shownKey =
    pitchSlideKeys(variant).find((key) => key === current) ?? "title";
  const pdf = useMutation({
    mutationFn: (request: PdfRequest) => downloadPdf(planId, request),
    // A read: no history to read again.
    meta: { readsHistoryAgain: false },
  });
  const request: PdfRequest = { variant, versionId };
  const download = () => {
    if (!pdf.isPending) pdf.mutate(request);
  };
  // Retry goes with the failure it sits in: focus moves to Download PDF first.
  const retry = () => {
    document.getElementById(downloadId)?.focus();
    download();
  };
  // A failure tells of the deck it was for, not of one chosen since.
  const pdfFailure =
    pdf.isError &&
    pdf.variables?.variant === variant &&
    pdf.variables.versionId === versionId
      ? pdf.error
      : null;

  const header = (
    <Heading level={1} variant="heading-1-toolbar">
      {t("plans:pitch.title")}
    </Heading>
  );
  const tools = (
    <DeckTools
      home={home}
      search={search}
      onSearch={(next) => {
        setCurrent(shownKey);
        onSearch(next);
      }}
    />
  );
  const primaryAction = (
    <Flex gap="space-200" alignItems="center">
      {pdf.isPending && (
        <Text variant="body-sm" tone="secondary">
          {t("plans:pitch.preparing")}
        </Text>
      )}
      <Button
        id={downloadId}
        variant="primary"
        onPress={download}
        isPending={pdf.isPending}
        isDisabled={!isOnline}
      >
        {t("plans:pitch.download")}
      </Button>
    </Flex>
  );

  if (deck.isError && deck.data === undefined) {
    return (
      <FailureState
        error={deck.error}
        onRetry={() => void deck.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  const data: PitchDeck | undefined = deck.data;
  if (data === undefined) {
    if (isSlow) {
      return <SlowLoadingState onRetry={() => void deck.refetch()} />;
    }
    return (
      <PresentationPattern
        header={header}
        tools={tools}
        primaryAction={primaryAction}
        slides={skeletonSlides(variant)}
        currentId={shownKey}
        onCurrentChange={() => {}}
        slide={<BlankSlide slideKey={shownKey} />}
        notes={<NotesSkeleton />}
        isLoading
      />
    );
  }

  const footer = pitchFooterText(data, { timeZone: me.timezone });
  const slide = data.slides.find(({ key }) => key === shownKey);
  if (slide === undefined) throw new Error(`No ${shownKey} slide in the deck`);
  const name = slideName(slide);
  const slideTools: ReactNode[] = [];
  if (slide.editSource !== null) {
    slideTools.push(
      <Link
        key="source"
        isQuiet
        href={planItemHref(
          workspace.id,
          ideaId,
          planId,
          slide.editSource.itemNo,
        )}
      >
        {t("plans:pitch.editSource")}
      </Link>,
    );
  }
  if (slide.editInValidation !== null) {
    slideTools.push(
      <Link
        key="validation"
        isQuiet
        href={
          slide.editInValidation === "costs"
            ? costsHref(workspace.id, ideaId)
            : economicsHref(workspace.id, ideaId)
        }
      >
        {t("plans:pitch.editInValidation")}
      </Link>,
    );
  }
  slideTools.push(
    <ItemCommentsButton
      key="comments"
      label={name}
      count={slide.commentCount}
      onPress={() =>
        panel.show("comments", {
          kind: "item",
          item: slideTarget(planId, variant, slide.key),
        })
      }
    />,
  );
  const notices =
    pdfFailure === null && !slide.overflow ? undefined : (
      <>
        {pdfFailure !== null && (
          <PdfFailure
            error={pdfFailure}
            onRetry={retry}
            isRetryDisabled={!isOnline}
          />
        )}
        {slide.overflow && (
          <InlineAlert variant="notice">{t("plans:pitch.tooLong")}</InlineAlert>
        )}
      </>
    );

  return (
    <PresentationPattern
      header={header}
      tools={tools}
      primaryAction={primaryAction}
      slides={data.slides.map((item) => ({
        id: item.key,
        title: slideName(item),
        thumbnail: (
          <Slide
            slide={item}
            footer={footer}
            currency={workspace.currency}
            isThumbnail
          />
        ),
      }))}
      currentId={slide.key}
      onCurrentChange={(id) => setCurrent(id as PitchSlideKey)}
      notices={notices}
      slideTools={slideTools}
      slide={
        <Slide
          slide={slide}
          footer={footer}
          currency={workspace.currency}
          headingLevel={2}
        />
      }
      notes={
        <>
          <Heading level={2} variant="label">
            {t("plans:pitch.whatToSay")}
          </Heading>
          {data.speakerNotes === null ? (
            <Text variant="body-long" tone="secondary" elementType="p">
              {t("pitch:notWrittenYet")}
            </Text>
          ) : (
            <Text variant="body-long" elementType="p">
              {data.speakerNotes}
            </Text>
          )}
        </>
      }
    />
  );
}

/**
 * 23's shape while it loads (design-spec 6.0.6): the title, and the blank slides of the
 * deck the URL asks for, with What to say under them. Drawn inside a `Skeleton`.
 */
function PitchDeckSkeleton({ variant }: { variant: PitchVariant }) {
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

/**
 * 23 Pitch Deck (design-spec 6.14): the one-minute or five-minute deck, from the plan now
 * or a saved version, made again each time it opens; its PDF; PNL-1 on the slides and,
 * from the header, on the deck with the idea's comments. Every role reads it, archived
 * too; the edit links are the API's to give.
 */
export function PitchDeckScreen({
  ideaId,
  planId,
  search,
}: {
  ideaId: string;
  planId: string;
  search: PitchSearch;
}) {
  const { t } = useTranslation(["ideas", "plans", "common"]);
  const { me, workspace } = useWorkspace();
  const navigate = useNavigate();
  const panel = usePanel();
  const home = useQuery(planHomeQuery(ideaId, planId));
  const { data: ideaData } = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(home.isPending);
  const data =
    home.data?.workspaceId === workspace.id && home.data.ideaId === ideaId
      ? home.data
      : undefined;
  const idea =
    ideaData?.idea.workspaceId === workspace.id ? ideaData.idea : undefined;
  useDocumentTitle(
    ...(data === undefined
      ? []
      : [t("plans:pitch.title"), data.name, workspace.name]),
  );
  // 23's comments are its slides' (SDD 6.3「画面と節の対応」: `pitch`), of either
  // length, with the idea's in the list.
  const comments: ScreenComments | undefined =
    data === undefined || idea === undefined
      ? undefined
      : {
          screen: {
            containerType: "business_plan",
            containerId: planId,
            sectionKeys: ["pitch"],
          },
          // Both reads say whether the idea is archived; either may come back first.
          idea: {
            id: ideaId,
            name: idea.name,
            archived: idea.archived || data.ideaArchived,
          },
          plan: { id: planId, archived: data.archived },
          dataKey: pitchKey(ideaId, planId),
          shows: (target) => slideOf(target, planId) !== undefined,
          // A slide is "Pitch Deck", as the API names it (SDD 5.11 `HistoryEntry.label`).
          labelOf: (target) => {
            if (target.type === "idea") return idea.name;
            return slideOf(target, planId) === undefined
              ? undefined
              : t("common:itemLabel.list.pitch_slide");
          },
        };

  let body: ReactNode;
  if (home.data !== undefined && home.data.workspaceId !== workspace.id) {
    // Another workspace's plan under this one's URL (SDD 4章).
    body = <NoAccessState dashboardHref={dashboardHref(me)} />;
  } else if (home.data !== undefined && data === undefined) {
    // A plan of another idea of this workspace: no plan by that path (6.12).
    body = <NotFoundState dashboardHref={dashboardHref(me)} />;
  } else if (data !== undefined) {
    body = (
      <DeckBody
        home={data}
        ideaId={ideaId}
        planId={planId}
        search={search}
        // The length and the version replace the entry, as 22's tabs: Back leaves 23.
        onSearch={(next) =>
          void navigate({
            href: panel.keep(pitchHref(workspace.id, ideaId, planId, next)),
            replace: true,
          })
        }
      />
    );
  } else if (home.isError) {
    body = (
      <FailureState
        error={home.error}
        onRetry={() => void home.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  } else if (isSlow) {
    body = <SlowLoadingState onRetry={() => void home.refetch()} />;
  } else {
    body = <PitchDeckSkeleton variant={search.variant ?? DEFAULT_VARIANT} />;
  }
  return (
    <WorkspaceFrame
      current="ideas"
      comments={comments}
      back={{
        label: t("plans:home.back"),
        href: planHref(workspace.id, ideaId, planId),
      }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {idea !== undefined && (
            <Breadcrumb href={ideaHref(workspace.id, ideaId)}>
              {idea.name}
            </Breadcrumb>
          )}
          {data !== undefined && (
            <Breadcrumb href={planHref(workspace.id, ideaId, planId)}>
              {data.name}
            </Breadcrumb>
          )}
          <Breadcrumb>{t("plans:pitch.title")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      {body}
    </WorkspaceFrame>
  );
}
