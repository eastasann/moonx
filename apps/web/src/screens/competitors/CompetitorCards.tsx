import type { Competitor } from "@moonx/schemas";
import { Badge, Card, CardView, Flex, Heading, Stack, Tag, TagGroup, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { fieldText } from "../../components/RowFields";
import { evidenceTagText } from "../../lib/evidence-tag";
import { formatItemTarget } from "../../lib/panel-target";
import { draftOf, type FieldSpec } from "../../lib/row-fields";

/** The fields a card shows under its name, in the order of design-spec 6.10. */
export const CARD_FIELD_KEYS = [
  "targetCustomer",
  "offering",
  "strength",
  "weakness",
  "whyChosen",
  "whySurvive",
] as const;

/** The price of a card, "₱320 per box", or null when the competitor has none. */
export function priceText(
  specs: readonly FieldSpec[],
  competitor: Competitor,
  currency: string,
  timeZone: string,
): string | null {
  const draft = draftOf(specs, competitor);
  const price = specs.find((spec) => spec.key === "typicalPrice");
  const note = specs.find((spec) => spec.key === "priceNote");
  const amount = price ? fieldText(price, draft.typicalPrice ?? null, currency, timeZone) : null;
  const noteText = note ? fieldText(note, draft.priceNote ?? null, currency, timeZone) : null;
  const parts = [amount, noteText].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * The competitors as cards (design-spec 6.10, pattern E). Pressing a card opens it, to edit or,
 * for a Viewer, to read. The card shows every filled field, so cards can be read side by side.
 */
export function CompetitorCards({
  competitors,
  specs,
  currency,
  timeZone,
  columns,
  onOpen,
}: {
  competitors: readonly Competitor[];
  specs: readonly FieldSpec[];
  currency: string;
  timeZone: string;
  columns: 1 | 2 | 3;
  onOpen: (competitorId: string) => void;
}) {
  const { t } = useTranslation(["research", "form"]);
  return (
    <CardView
      aria-label={t("research:competitors.cardsLabel")}
      columns={columns}
      onAction={(key) => onOpen(String(key))}
    >
      {competitors.map((competitor) => {
        const draft = draftOf(specs, competitor);
        const type = specs.find((spec) => spec.key === "type");
        const typeText = type ? fieldText(type, draft.type ?? null, currency, timeZone) : null;
        const price = priceText(specs, competitor, currency, timeZone);
        return (
          <Card key={competitor.id} id={competitor.id} textValue={competitor.name}>
            <Stack gap="space-200">
              <Flex gap="space-100" justify="between" align="start">
                <Heading level={3}>{competitor.name}</Heading>
                <ItemPanelButtons
                  target={formatItemTarget("competitor", competitor.id)}
                  commentCount={competitor.commentCount}
                />
              </Flex>
              {typeText || price ? (
                <Flex gap="space-100" align="center" wrap>
                  {typeText ? <Badge size="S">{typeText}</Badge> : null}
                  {price ? (
                    <Text variant="label" as="span">
                      {price}
                    </Text>
                  ) : null}
                </Flex>
              ) : null}
              {CARD_FIELD_KEYS.map((key) => {
                const spec = specs.find((s) => s.key === key);
                const text = spec ? fieldText(spec, draft[key] ?? null, currency, timeZone) : null;
                if (!spec || text === null) return null;
                return (
                  <Stack key={key} gap="space-50">
                    <Text variant="caption" tone="secondary">
                      {spec.label}
                    </Text>
                    <Text variant="body-sm">{text}</Text>
                  </Stack>
                );
              })}
              {competitor.evidence.length > 0 ? (
                <TagGroup aria-label={t("research:evidence.attached")} size="S">
                  {competitor.evidence.map((item) => {
                    const text = evidenceTagText(item, t("form:evidence.deletedLog"), timeZone);
                    return (
                      <Tag key={item.id} id={item.id} textValue={text}>
                        {text}
                      </Tag>
                    );
                  })}
                </TagGroup>
              ) : null}
            </Stack>
          </Card>
        );
      })}
    </CardView>
  );
}
