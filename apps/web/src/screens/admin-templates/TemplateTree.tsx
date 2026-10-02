import type { TemplateVersionDetail } from "@moonx/schemas";
import { Tree, TreeItem } from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type PseudoNode, pseudoNodesOf } from "../../lib/admin-templates";

/**
 * The outline of screen 27 (design-spec 6.17): sections with their questions (the plan's items
 * with their sub-items), then the version-wide settings that belong to its kind. A node's key is
 * its id, or the name of the setting; selecting one opens it in the right pane.
 */
export function TemplateTree({
  detail,
  selected,
  onSelect,
}: {
  detail: TemplateVersionDetail;
  selected: string | undefined;
  onSelect: (node: string) => void;
}) {
  const { t } = useTranslation("admin");
  const [expanded, setExpanded] = useState(() => new Set<string>(detail.sections.map((s) => s.id)));
  const seen = useRef(new Set(detail.sections.map((section) => section.id)));

  // A section added after the first render opens, so its new questions show where they were added.
  useEffect(() => {
    const added = detail.sections
      .map((section) => section.id)
      .filter((id) => !seen.current.has(id));
    if (added.length === 0) return;
    for (const id of added) seen.current.add(id);
    setExpanded((prev) => new Set([...prev, ...added]));
  }, [detail.sections]);

  // Choosing a question from outside (an error's "Go to") opens its section.
  useEffect(() => {
    const section = detail.sections.find((candidate) =>
      candidate.questions.some((question) => question.id === selected),
    );
    if (section)
      setExpanded((prev) => (prev.has(section.id) ? prev : new Set([...prev, section.id])));
  }, [detail.sections, selected]);

  const isPlan = detail.kind === "business_plan";
  return (
    <Tree
      aria-label={t("edit.treeLabel")}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set(selected ? [selected] : [])}
      expandedKeys={expanded}
      onExpandedChange={(keys) => setExpanded(new Set([...keys].map(String)))}
      onSelectionChange={(keys) => {
        const [key] = keys === "all" ? [] : keys;
        if (key !== undefined) onSelect(String(key));
      }}
    >
      {detail.sections.map((section) => (
        <TreeItem
          key={section.id}
          id={section.id}
          textValue={section.title}
          title={
            isPlan
              ? t("edit.tree.planSection", { key: section.key, title: section.title })
              : t("edit.tree.section", { key: section.key, title: section.title })
          }
          trailing={section.questions.length}
        >
          {section.questions.map((question) => (
            <TreeItem
              key={question.id}
              id={question.id}
              textValue={question.title}
              title={question.title}
            />
          ))}
        </TreeItem>
      ))}
      {pseudoNodesOf(detail.kind).map((node) => (
        <TreeItem
          key={node}
          id={node}
          textValue={pseudoLabel(t, node)}
          title={pseudoLabel(t, node)}
        />
      ))}
    </Tree>
  );
}

export function pseudoLabel(t: TFunction, node: PseudoNode) {
  switch (node) {
    case "ai-prompt":
      return t("edit.nodes.aiPrompt");
    case "cost-defaults":
      return t("edit.nodes.costDefaults");
    case "check-rules":
      return t("edit.nodes.checkRules");
    case "execution-presets":
      return t("edit.nodes.executionPresets");
  }
}
