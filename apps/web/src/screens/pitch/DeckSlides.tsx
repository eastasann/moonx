import type { PitchDeck } from "@moonx/schemas";
import { Flex, Heading, Link, Slide, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { formatItemTarget } from "../../lib/panel-target";
import { slideAnchorId, slideProps, slideTargetKey, validationPath } from "../../lib/pitch";
import { planPaths } from "../../lib/plans";
import { useMe } from "../../lib/session";

/**
 * The slides, each with its anchor line (position, Edit source, Edit in validation, Comments)
 * and "What to say" below. Slide comments have no History: slides are generated, so no change
 * to one is ever recorded (design-spec 6.0.5).
 */
export function DeckSlides({
  deck,
  workspaceId,
  ideaId,
  planId,
  currency,
  canEdit,
}: {
  deck: PitchDeck;
  workspaceId: string;
  ideaId: string;
  planId: string;
  currency: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation("pitch");
  const me = useMe();
  const paths = planPaths(workspaceId, ideaId, planId);
  const notes = deck.speakerNotes?.split(/\n+/).filter((line) => line.trim() !== "") ?? [];
  return (
    <Stack gap="space-400">
      {deck.slides.map((slide, index) => (
        <Stack key={slide.key} gap="space-100">
          <Flex justify="between" align="center" wrap gap="space-100">
            <Text variant="label" as="span" id={slideAnchorId(slide.key)}>
              {t("slide.label", { n: index + 1, total: deck.slides.length, title: slide.title })}
            </Text>
            <Flex gap="space-200" align="center" wrap>
              {canEdit && slide.editSource ? (
                <Link href={paths.item(slide.editSource.itemNo)}>{t("slide.editSource")}</Link>
              ) : null}
              {canEdit && slide.editInValidation ? (
                <Link href={validationPath(workspaceId, ideaId, slide.editInValidation)}>
                  {t("slide.editInValidation")}
                </Link>
              ) : null}
              <ItemPanelButtons
                target={formatItemTarget(
                  "pitch_slide",
                  planId,
                  slideTargetKey(deck.variant, slide.key),
                )}
                commentCount={slide.commentCount}
                showHistory={false}
              />
            </Flex>
          </Flex>
          <Slide {...slideProps(t, deck, slide, currency, me.timezone)} />
        </Stack>
      ))}
      <Stack gap="space-100">
        <Heading level={2}>{t("notes.heading")}</Heading>
        <Text variant="caption" tone="secondary">
          {t("notes.help")}
        </Text>
        {notes.length > 0 ? (
          notes.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical lines are legal and the list never reorders
            <Text key={`${index}:${line}`} variant="body-long">
              {line}
            </Text>
          ))
        ) : (
          <Text tone="secondary">{t("notes.empty")}</Text>
        )}
      </Stack>
    </Stack>
  );
}
