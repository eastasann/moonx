import { ideaDecisionFilterSchema, stageSchema } from "@moonx/schemas";
import { Checkbox, Flex, Picker, PickerItem, SearchField } from "@moonx/ui-web";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type IdeaFilters, useWorkspaceMembers } from "../../lib/ideas";

/** How long typing in the search box rests before the list is asked again. */
const SEARCH_DELAY_MS = 300;

const ALL = "all";
const SORTS = ["updated", "created", "name"] as const;

/**
 * Stage, decision, proposer and sort pickers, the include-archived checkbox and the search box
 * (design-spec 6.8). Every change goes to the URL through `onChange`, which is the one source of
 * the filters.
 */
export function IdeaFilterBar({
  workspaceId,
  filters,
  onChange,
}: {
  workspaceId: string;
  filters: IdeaFilters;
  onChange: (patch: Partial<IdeaFilters>) => void;
}) {
  const { t } = useTranslation(["ideas", "validation"]);
  const members = useWorkspaceMembers(workspaceId);
  const [text, setText] = useState(filters.q ?? "");

  // Back and Forward, or "Clear filters", change `q` from outside the box.
  useEffect(() => setText(filters.q ?? ""), [filters.q]);
  useEffect(() => {
    const next = text.trim() || undefined;
    if (next === filters.q) return;
    const timer = setTimeout(() => onChange({ q: next }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, filters.q, onChange]);

  return (
    <Flex direction="column" gap="space-200">
      <Flex gap="space-100" wrap align="end">
        <Picker
          label={t("ideas:filters.stage")}
          size="S"
          value={filters.stage ?? ALL}
          onChange={(value) => onChange({ stage: stageSchema.options.find((s) => s === value) })}
        >
          <PickerItem id={ALL}>{t("ideas:filters.allStages")}</PickerItem>
          {stageSchema.options.map((stage) => (
            <PickerItem key={stage} id={stage}>
              {t(`validation:stage.${stage}`)}
            </PickerItem>
          ))}
        </Picker>
        <Picker
          label={t("ideas:filters.decision")}
          size="S"
          value={filters.decision}
          onChange={(value) => {
            const parsed = ideaDecisionFilterSchema.safeParse(value);
            if (parsed.success) onChange({ decision: parsed.data });
          }}
        >
          {ideaDecisionFilterSchema.options.map((decision) => (
            <PickerItem key={decision} id={decision}>
              {t(`ideas:decisionFilter.${decision}`)}
            </PickerItem>
          ))}
        </Picker>
        <Picker
          label={t("ideas:filters.proposer")}
          size="S"
          value={filters.proposer ?? ALL}
          onChange={(value) => onChange({ proposer: value && value !== ALL ? value : undefined })}
        >
          <PickerItem id={ALL}>{t("ideas:filters.allProposers")}</PickerItem>
          {(members.data?.items ?? []).map((member) => (
            <PickerItem key={member.user.id} id={member.user.id}>
              {member.user.displayName}
            </PickerItem>
          ))}
        </Picker>
        <Picker
          label={t("ideas:filters.sort")}
          size="S"
          value={filters.sort}
          onChange={(value) => {
            const sort = SORTS.find((s) => s === value);
            if (sort) onChange({ sort });
          }}
        >
          {SORTS.map((sort) => (
            <PickerItem key={sort} id={sort}>
              {t(`ideas:sort.${sort}`)}
            </PickerItem>
          ))}
        </Picker>
      </Flex>
      <SearchField
        label={t("ideas:filters.search")}
        placeholder={t("ideas:filters.searchPlaceholder")}
        clearLabel={t("ideas:filters.clearSearch")}
        size="S"
        value={text}
        onChange={setText}
      />
      <Checkbox
        size="S"
        isSelected={filters.archived}
        onChange={(archived) => onChange({ archived })}
      >
        {t("ideas:filters.includeArchived")}
      </Checkbox>
    </Flex>
  );
}
