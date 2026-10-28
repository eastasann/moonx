import { CardComparePattern, Heading, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** The shape of 15 while its list loads (design-spec 6.0.6). */
function CardsSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <Stack gap="space-300">
      {[0, 1, 2].map((card) => (
        <Stack key={card} gap="space-100">
          <Text variant="label">{t("validation:competitors.title")}</Text>
          <Text>{t("validation:competitors.empty", { range: "" })}</Text>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * 15's shape while it loads (design-spec 6.0.6). Drawn inside a `Skeleton`, its words are
 * bars and its Cards / Table switch is inert.
 */
export function CompetitorsSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <CardComparePattern
      header={<Heading level={1}>{t("validation:competitors.title")}</Heading>}
      view="cards"
      onViewChange={() => {}}
      cards={<CardsSkeleton />}
      table={null}
    />
  );
}
