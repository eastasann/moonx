import type { PitchVariant } from "@moonx/schemas";
import {
  Button,
  Flex,
  Heading,
  InlineAlert,
  Link,
  Picker,
  PickerItem,
  SegmentedControl,
  SegmentedControlItem,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorText } from "../../lib/error-text";
import { fetchPitchPdf, saveBlob } from "../../lib/pitch";
import { type PlanHome, pitchDeckPdfUrl } from "../../lib/plans";

const LATEST = "latest";

/**
 * The top of screen 23: back to the plan, the deck length, the source (Latest or a saved
 * version) and the PDF download with its pending and failed states.
 */
export function PitchHeader({
  home,
  planId,
  variant,
  versionId,
  backHref,
  onVariantChange,
  onVersionChange,
}: {
  home: PlanHome;
  planId: string;
  variant: PitchVariant;
  versionId: string | undefined;
  backHref: string;
  onVariantChange: (variant: PitchVariant) => void;
  onVersionChange: (versionId: string | undefined) => void;
}) {
  const { t } = useTranslation(["pitch", "app", "errors", "auth"]);
  const download = useMutation({
    mutationFn: async () => {
      const { blob, fileName } = await fetchPitchPdf(pitchDeckPdfUrl(planId, variant, versionId));
      saveBlob(blob, fileName);
    },
  });
  const viewing = versionId ? home.versions.find((v) => v.id === versionId) : undefined;
  return (
    <Stack gap="space-200">
      <Flex>
        <Link href={backHref}>
          <ArrowLeft aria-hidden /> {t("back")}
        </Link>
      </Flex>
      <Flex gap="space-200" align="center" wrap>
        <Heading level={1}>{t("heading")}</Heading>
        <Text tone="secondary" as="span">
          {home.name}
        </Text>
      </Flex>
      <Flex gap="space-200" align="end" wrap>
        <SegmentedControl
          aria-label={t("variant.label")}
          value={variant}
          onChange={(value) => onVariantChange(value === "five" ? "five" : "one")}
        >
          <SegmentedControlItem value="one">{t("variant.one")}</SegmentedControlItem>
          <SegmentedControlItem value="five">{t("variant.five")}</SegmentedControlItem>
        </SegmentedControl>
        <Picker
          label={t("source.label")}
          size="S"
          value={versionId ?? LATEST}
          onChange={(value) => onVersionChange(value && value !== LATEST ? value : undefined)}
        >
          <PickerItem id={LATEST}>{t("source.latest")}</PickerItem>
          {home.versions.map((version) => (
            <PickerItem key={version.id} id={version.id}>
              {version.name}
            </PickerItem>
          ))}
        </Picker>
        {download.isPending ? (
          <Button isPending pendingLabel={t("preparing")}>
            {t("preparing")}
          </Button>
        ) : (
          <Button variant="secondary" onPress={() => download.mutate()}>
            {t("download")}
          </Button>
        )}
      </Flex>
      {viewing ? (
        <InlineAlert variant="neutral" heading={t("versionNotice", { name: viewing.name })} />
      ) : null}
      {download.isError ? (
        <InlineAlert variant="negative" heading={t("pdfFailed")}>
          <Stack gap="space-100" align="start">
            <Text>{errorText(t, download.error)}</Text>
            <Button variant="secondary" size="S" onPress={() => download.mutate()}>
              {t("retry")}
            </Button>
          </Stack>
        </InlineAlert>
      ) : null}
    </Stack>
  );
}
