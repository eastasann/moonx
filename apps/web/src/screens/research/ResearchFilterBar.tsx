import { Button, Flex, Picker, PickerItem } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import {
  type ResearchFilters,
  SOURCE_TYPES,
  SUPPORTS_CHECKS,
  sourceTypeLabel,
  supportsLabel,
} from "../../lib/research";

const ALL = "all";

/**
 * The filters of 14 (design-spec 6.10): the check an entry supports and its source type. The
 * choice goes to the URL through `onChange`, which is the one source of the filters.
 */
export function ResearchFilterBar({
  filters,
  onChange,
}: {
  filters: ResearchFilters;
  onChange: (patch: Partial<ResearchFilters>) => void;
}) {
  const { t } = useTranslation("research");
  return (
    <Flex gap="space-100" wrap align="end">
      <Picker
        label={t("research:log.filters.supports")}
        size="S"
        value={filters.supports ?? ALL}
        onChange={(value) =>
          onChange({ supports: SUPPORTS_CHECKS.find((check) => check === value) })
        }
      >
        <PickerItem id={ALL}>{t("research:log.filters.allChecks")}</PickerItem>
        {SUPPORTS_CHECKS.map((check) => (
          <PickerItem key={check} id={check}>
            {supportsLabel(t, check)}
          </PickerItem>
        ))}
      </Picker>
      <Picker
        label={t("research:log.filters.source")}
        size="S"
        value={filters.source ?? ALL}
        onChange={(value) => onChange({ source: SOURCE_TYPES.find((type) => type === value) })}
      >
        <PickerItem id={ALL}>{t("research:log.filters.allSources")}</PickerItem>
        {SOURCE_TYPES.map((type) => (
          <PickerItem key={type} id={type}>
            {sourceTypeLabel(t, type)}
          </PickerItem>
        ))}
      </Picker>
      {filters.supports || filters.source ? (
        <Button
          variant="secondary"
          size="S"
          onPress={() => onChange({ supports: undefined, source: undefined })}
        >
          {t("research:log.filters.clear")}
        </Button>
      ) : null}
    </Flex>
  );
}
