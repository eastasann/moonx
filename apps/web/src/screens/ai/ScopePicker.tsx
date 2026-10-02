import type { TemplateKind } from "@moonx/schemas";
import { Checkbox, CheckboxGroup, Flex, Stack } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import type { ScopeSection } from "../../lib/ai-scope";
import { sectionLabel } from "./labels";

export interface ScopePickerProps {
  kind: TemplateKind;
  /** The sections that hold questions the exchange carries, in template order. */
  sections: readonly ScopeSection[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
}

/**
 * The scope checkboxes of design-spec 6.6: every section, and for a plan the shortcuts that tick
 * the whole plan, Part A or Part B. A shortcut shows a dash when only some of its sections are ticked.
 */
export function ScopePicker({ kind, sections, selected, onChange }: ScopePickerProps) {
  const { t } = useTranslation("ai");
  const chosen = new Set(selected);

  const shortcut = (label: string, keys: readonly string[]) => {
    if (keys.length === 0) return null;
    const count = keys.filter((key) => chosen.has(key)).length;
    return (
      <Checkbox
        isSelected={count === keys.length}
        isIndeterminate={count > 0 && count < keys.length}
        onChange={(on) => {
          const next = new Set(chosen);
          for (const key of keys) {
            if (on) next.add(key);
            else next.delete(key);
          }
          onChange(sections.map((s) => s.key).filter((key) => next.has(key)));
        }}
      >
        {label}
      </Checkbox>
    );
  };

  const inPart = (part: "a" | "b") => sections.filter((s) => s.part === part).map((s) => s.key);
  const isPlan = kind === "business_plan";

  return (
    <Stack gap="space-200">
      <Flex gap="space-300" wrap>
        {shortcut(
          isPlan ? t("export.scope.wholePlan") : t("export.scope.selectAll"),
          sections.map((s) => s.key),
        )}
        {isPlan ? shortcut(t("export.scope.partA"), inPart("a")) : null}
        {isPlan ? shortcut(t("export.scope.partB"), inPart("b")) : null}
      </Flex>
      <CheckboxGroup
        label={isPlan ? t("export.scope.items") : t("export.scope.sections")}
        orientation="horizontal"
        value={[...selected]}
        onChange={(keys) =>
          onChange(sections.map((s) => s.key).filter((key) => keys.includes(key)))
        }
      >
        {sections.map((section) => (
          <Checkbox key={section.key} value={section.key}>
            {sectionLabel(t, kind, section)}
          </Checkbox>
        ))}
      </CheckboxGroup>
    </Stack>
  );
}
