import { formatUnits } from "@moonx/i18n";
import type { FauBreakdown } from "@moonx/schemas";
import { InlineAlert, Meter, Stack } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { fauSegments } from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";

/** The F/A/U band with its legend, and the warning for Facts that have no evidence (design-spec 6.1). */
export function FauBreakdownBand({ fau }: { fau: FauBreakdown }) {
  const { t } = useTranslation("validation");
  const segments = fauSegments(t, fau);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.fau")}</BlockHeading>
      <Meter
        label={t("home.fau.label")}
        description={t("home.fau.total", { count: total, value: formatUnits(total) })}
        segments={segments}
      />
      {fau.factNoEvidence > 0 ? (
        <InlineAlert
          variant="notice"
          role="note"
          heading={t("fau.factNoEvidenceCount", { count: fau.factNoEvidence })}
        />
      ) : null}
    </Stack>
  );
}
