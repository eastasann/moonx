import { formatList, formatRelativeTime } from "@moonx/i18n";
import {
  type TemplateCheckResult,
  type TemplateKind,
  type TemplateVersionDetail,
  THRESHOLD_CHECK_KEYS,
} from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Badge,
  Breadcrumb,
  Breadcrumbs,
  Button,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Flex,
  Heading,
  IllustratedMessage,
  ListDetailPattern,
  ListView,
  ListViewItem,
  MenuItem,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  Text,
  Tree,
  TreeItem,
  useIsNarrow,
  useTwoColumns,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { MousePointerClick, Plus } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminToast, useDetailHistory } from "../components/admin";
import { toastFailure } from "../components/ideaActions";
import {
  ReorderDialog,
  ReorderGroupedDialog,
} from "../components/ReorderDialog";
import { failureCode, SendFailure } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import {
  AddQuestionDialog,
  AddSectionDialog,
  DeleteNodeDialog,
  type DeleteTarget,
  PreviewDialog,
} from "../components/TemplateDialogs";
import {
  AiPromptEditor,
  CHECK_PARAMS,
  CheckRulesEditor,
  COST_CATEGORIES,
  CostDefaultsEditor,
  ExecutionPresetsEditor,
  NameEditor,
  QuestionEditor,
  SectionEditor,
} from "../components/TemplateEditors";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useWorkspace } from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { useAutosave, useAutosaveState } from "../lib/autosave-react";
import { HeldInputContext } from "../lib/draft-fields";
import {
  adminTemplatesHref,
  SETTINGS_NODES,
  type SettingsNode,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  adminTemplatesQuery,
  templateCheckQuery,
  templateVersionKey,
  templateVersionQuery,
} from "../lib/queries";
import { isSessionLost, useSendThrough } from "../lib/send";
import {
  draftScope,
  putVersion,
  type Question,
  questionItemKey,
  type Section,
  sectionItemKey,
} from "../lib/template-drafts";
import { useDocumentTitle } from "../lib/title";

/** `/admin/templates/versions/$versionId`'s search parameters (SDD 4章). */
export interface TemplateVersionSearch {
  /** The node of the tree shown beside it: a section's or question's id, or a setting. */
  node?: string;
}

/** A node of 27's tree (design-spec 6.17 27). */
type TreeNode =
  | { kind: "section"; section: Section }
  | { kind: "question"; section: Section; question: Question }
  | { kind: "settings"; node: SettingsNode };

/**
 * The settings at the end of the tree (design-spec 6.17): the template's name, then what
 * the kind holds: the AI prompt only for a self analysis, the cost rows and check
 * thresholds only for a validation, the execution rows only for a plan.
 */
export function settingsNodesOf(kind: TemplateKind): SettingsNode[] {
  if (kind === "self_analysis") return ["name", "ai-prompt"];
  if (kind === "validation") return ["name", "cost-defaults", "check-rules"];
  return ["name", "execution-presets"];
}

/**
 * The node `id` names in `version`, or null: another version's node, or a setting the
 * kind does not hold, selects nothing (SDD 4章).
 */
function findNode(
  version: TemplateVersionDetail,
  id: string | undefined,
): TreeNode | null {
  if (id === undefined) return null;
  const setting = SETTINGS_NODES.find((node) => node === id);
  if (setting !== undefined) {
    return settingsNodesOf(version.kind).includes(setting)
      ? { kind: "settings", node: setting }
      : null;
  }
  for (const section of version.sections) {
    if (section.id === id) return { kind: "section", section };
    const question = section.questions.find((item) => item.id === id);
    if (question !== undefined) return { kind: "question", section, question };
  }
  return null;
}

/** The name a node goes by in the tree and the check's rows. */
function nodeName(node: TreeNode, t: TFunction<["admin"]>): string {
  if (node.kind === "settings") return t(`admin:version.settings.${node.node}`);
  if (node.kind === "section") {
    return t("admin:version.sectionName", {
      key: node.section.key,
      title: node.section.title,
    });
  }
  return t("admin:version.questionName", {
    key: node.question.key,
    title: node.question.title,
  });
}

/** A value of the detail, or "None" in a quieter tone. */
function Value({
  children,
  isLong = false,
}: {
  children: string | null | undefined;
  isLong?: boolean;
}) {
  const { t } = useTranslation(["admin"]);
  if (children === null || children === undefined || children.trim() === "") {
    return <Text tone="tertiary">{t("admin:version.none")}</Text>;
  }
  return (
    <Text variant={isLong ? "body-long" : "body-compact"}>{children}</Text>
  );
}

/** A section as it stands (design-spec 6.17「セクション」); plans call it an item. */
function SectionFacts({
  section,
  kind,
}: {
  section: Section;
  kind: TemplateKind;
}) {
  const { t } = useTranslation(["admin"]);
  return (
    <DescriptionList>
      <DescriptionListItem label={t("admin:version.section.key")}>
        <Value>{section.key}</Value>
      </DescriptionListItem>
      <DescriptionListItem label={t("admin:version.section.title")}>
        <Value>{section.title}</Value>
      </DescriptionListItem>
      {kind === "self_analysis" && (
        <DescriptionListItem label={t("admin:version.section.subtitle")}>
          <Value>{section.subtitle}</Value>
        </DescriptionListItem>
      )}
      <DescriptionListItem
        label={
          kind === "business_plan"
            ? t("admin:version.section.description")
            : t("admin:version.section.guidance")
        }
      >
        <Value isLong>{section.guidance}</Value>
      </DescriptionListItem>
      {kind === "business_plan" && (
        <DescriptionListItem label={t("admin:version.section.part")}>
          <Value>
            {section.part === null
              ? null
              : t(`admin:version.part.${section.part}`)}
          </Value>
        </DescriptionListItem>
      )}
      <DescriptionListItem
        label={
          kind === "business_plan"
            ? t("admin:version.section.prompts")
            : t("admin:version.section.questions")
        }
      >
        <Text variant="number-sm">{String(section.questions.length)}</Text>
      </DescriptionListItem>
    </DescriptionList>
  );
}

/** What a question's answer type carries: its choices, columns, key numbers or list. */
function optionsOf(question: Question, t: TFunction<["admin"]>) {
  const { options } = question;
  if (options === null) return null;
  switch (options.kind) {
    case "choice":
      return {
        label: t("admin:version.question.choices"),
        value: formatList(options.choices),
      };
    case "table":
      return {
        label: t("admin:version.question.columns"),
        value: options.columns
          .map((column) =>
            t("admin:version.question.column", {
              label: column.label,
              key: column.key,
              type: t(`admin:columnType.${column.type}`),
            }),
          )
          .join("\n"),
      };
    case "linked_metric":
      return {
        label: t("admin:version.question.metrics"),
        value: formatList(options.metricKeys),
      };
    case "execution_view":
      return {
        label: t("admin:version.question.executionList"),
        value: t(`admin:executionType.${options.executionType}`),
      };
  }
}

/** A question as it stands (design-spec 6.17「設問」); plans call it a prompt. */
function QuestionFacts({
  question,
  kind,
}: {
  question: Question;
  kind: TemplateKind;
}) {
  const { t } = useTranslation(["admin"]);
  const options = optionsOf(question, t);
  const conditions = Object.entries(question.displayCondition ?? {});
  return (
    <DescriptionList>
      <DescriptionListItem label={t("admin:version.question.key")}>
        <Value>{question.key}</Value>
      </DescriptionListItem>
      <DescriptionListItem label={t("admin:version.question.title")}>
        <Value>{question.title}</Value>
      </DescriptionListItem>
      <DescriptionListItem label={t("admin:version.question.prompt")}>
        <Value isLong>{question.prompt}</Value>
      </DescriptionListItem>
      <DescriptionListItem label={t("admin:version.question.example")}>
        <Value isLong>{question.example}</Value>
      </DescriptionListItem>
      <DescriptionListItem label={t("admin:version.question.hint")}>
        <Value isLong>{question.hint}</Value>
      </DescriptionListItem>
      <DescriptionListItem label={t("admin:version.question.answerType")}>
        <Value>{t(`admin:answerType.${question.answerType}`)}</Value>
      </DescriptionListItem>
      {options !== null && (
        <DescriptionListItem label={options.label}>
          <Value isLong>{options.value}</Value>
        </DescriptionListItem>
      )}
      <DescriptionListItem label={t("admin:version.question.shownWhen")}>
        <Value isLong>
          {conditions.length === 0
            ? t("admin:version.question.always")
            : conditions
                .map(([key, values]) =>
                  t("admin:version.question.condition", {
                    key,
                    values: formatList(values),
                  }),
                )
                .join("\n")}
        </Value>
      </DescriptionListItem>
      {kind === "validation" && (
        <DescriptionListItem label={t("admin:version.question.fau")}>
          <Value>
            {question.hasFau
              ? t("admin:version.question.fauOn")
              : t("admin:version.question.fauOff")}
          </Value>
        </DescriptionListItem>
      )}
      {kind === "business_plan" && (
        <DescriptionListItem label={t("admin:version.question.copyFrom")}>
          <Value>
            {question.copyFrom === null || question.copyFrom.length === 0
              ? null
              : formatList(question.copyFrom)}
          </Value>
        </DescriptionListItem>
      )}
    </DescriptionList>
  );
}

/** A setting at the end of the tree as it stands (design-spec 6.17). */
function SettingsFacts({
  node,
  version,
}: {
  node: SettingsNode;
  version: TemplateVersionDetail;
}) {
  const { t } = useTranslation(["admin", "common"]);
  let body: ReactNode;
  if (node === "name") {
    body = <Value>{version.name}</Value>;
  } else if (node === "ai-prompt") {
    body = <Value isLong>{version.aiPrompt}</Value>;
  } else if (node === "cost-defaults") {
    body = COST_CATEGORIES.map((category) => {
      const rows = version.costDefaults.filter(
        (row) => row.category === category,
      );
      return (
        <Stack key={category} gap="space-100">
          <Heading level={3} variant="label">
            {t(`admin:costCategory.${category}`)}
          </Heading>
          {rows.length === 0 ? (
            <Text tone="tertiary">{t("admin:version.none")}</Text>
          ) : (
            <RowList aria-label={t(`admin:costCategory.${category}`)}>
              {rows.map((row) => (
                <RowListItem key={row.id} end={row.key}>
                  {row.name.trim() === ""
                    ? t("admin:version.unnamed")
                    : row.name}
                </RowListItem>
              ))}
            </RowList>
          )}
        </Stack>
      );
    });
  } else if (node === "check-rules") {
    body = THRESHOLD_CHECK_KEYS.map((checkKey) => {
      const rule = version.checkRules.find(
        (item) => item.checkKey === checkKey,
      );
      return (
        <Stack key={checkKey} gap="space-100">
          <Heading level={3} variant="label">
            {t(`admin:checkRule.${checkKey}.title`)}
          </Heading>
          <RowList aria-label={t(`admin:checkRule.${checkKey}.title`)}>
            {CHECK_PARAMS[checkKey].map(([param, label]) => {
              const value = rule?.params[param];
              return (
                <RowListItem
                  key={param}
                  end={
                    value === undefined
                      ? t("admin:version.none")
                      : String(value)
                  }
                  isEndNumeric={value !== undefined}
                >
                  {t(label)}
                </RowListItem>
              );
            })}
          </RowList>
        </Stack>
      );
    });
  } else {
    body = (["milestone", "launch", "kpi"] as const).map((type) => {
      const rows = version.executionPresets.filter((row) => row.type === type);
      return (
        <Stack key={type} gap="space-100">
          <Heading level={3} variant="label">
            {t(`admin:presetType.${type}`)}
          </Heading>
          {rows.length === 0 ? (
            <Text tone="tertiary">{t("admin:version.none")}</Text>
          ) : (
            <RowList aria-label={t(`admin:presetType.${type}`)}>
              {rows.map((row) => (
                <RowListItem
                  key={row.id}
                  end={
                    row.launchTiming !== null
                      ? t(`common:launchTiming.${row.launchTiming}`)
                      : (row.area ?? undefined)
                  }
                >
                  {row.title}
                </RowListItem>
              ))}
            </RowList>
          )}
        </Stack>
      );
    });
  }
  return <Stack gap="space-300">{body}</Stack>;
}

/** Beside the tree while no node is chosen: what to do. */
function ChooseNode() {
  const { t } = useTranslation(["admin"]);
  return (
    <IllustratedMessage
      headingLevel={2}
      size="S"
      icon={<MousePointerClick />}
      heading={t("admin:version.choose")}
    />
  );
}

/** A node as it stands: what a published version and a phone's draft show. */
function NodeFacts({
  node,
  version,
}: {
  node: TreeNode;
  version: TemplateVersionDetail;
}) {
  if (node.kind === "section") {
    return <SectionFacts section={node.section} kind={version.kind} />;
  }
  if (node.kind === "question") {
    return <QuestionFacts question={node.question} kind={version.kind} />;
  }
  return <SettingsFacts node={node.node} version={version} />;
}

/** A draft's node, its fields saved as they are typed (design-spec 6.17「下書きの編集」). */
function NodeEditor({
  node,
  version,
}: {
  node: TreeNode;
  version: TemplateVersionDetail;
}) {
  if (node.kind === "section") {
    return <SectionEditor version={version} section={node.section} />;
  }
  if (node.kind === "question") {
    return <QuestionEditor version={version} question={node.question} />;
  }
  switch (node.node) {
    case "name":
      return <NameEditor version={version} />;
    case "ai-prompt":
      return <AiPromptEditor version={version} />;
    case "cost-defaults":
      return <CostDefaultsEditor version={version} />;
    case "check-rules":
      return <CheckRulesEditor version={version} />;
    case "execution-presets":
      return <ExecutionPresetsEditor version={version} />;
  }
}

/** What the ⋯ and Preview of a node ask the screen for (design-spec 6.17). */
type NodeAction =
  | { kind: "preview"; section: Section }
  | { kind: "add-question"; section: Section }
  | { kind: "reorder-sections" }
  | { kind: "reorder-questions" }
  | { kind: "delete"; target: DeleteTarget };

/** The id that names a node in the tree and the URL. */
const nodeIdOf = (node: TreeNode) =>
  node.kind === "settings"
    ? node.node
    : node.kind === "section"
      ? node.section.id
      : node.question.id;

/**
 * The selected node beside the tree: its heading, with Preview and, on a draft, its ⋯ for
 * a section or question; then, on a draft, its fields to edit, which a phone shows as they
 * stand with Edit opening them in a sheet (4.1 D); on a published version, as it stands.
 */
function NodeDetail({
  node,
  version,
  onAction,
}: {
  node: TreeNode;
  version: TemplateVersionDetail;
  onAction: (action: NodeAction) => void;
}) {
  const { t } = useTranslation(["admin"]);
  const isPhone = useIsNarrow();
  const [isEditing, setEditing] = useState(false);
  const isDraft = version.status === "draft";
  const words = version.kind === "business_plan" ? "plan" : "other";
  const section = node.kind === "settings" ? null : node.section;
  const name = nodeName(node, t);
  const heading =
    node.kind === "question" ? (
      <Stack gap="space-50">
        <Text variant="number-sm" tone="secondary">
          {node.question.key}
        </Text>
        <Heading level={2}>{node.question.title}</Heading>
      </Stack>
    ) : (
      <Heading level={2}>
        {node.kind === "section"
          ? node.section.title
          : t(`admin:version.settings.${node.node}`)}
      </Heading>
    );
  const editor = (
    <NodeEditor key={nodeIdOf(node)} node={node} version={version} />
  );
  return (
    <Stack gap="space-400">
      <Flex justifyContent="space-between" alignItems="start" gap="space-200">
        {heading}
        {section !== null && (
          <Flex gap="space-100" alignItems="center" shrink={false}>
            <Button
              variant="secondary"
              size="S"
              onPress={() => onAction({ kind: "preview", section })}
            >
              {t("admin:version.preview.open")}
            </Button>
            {isDraft && (
              <ActionMenu
                aria-label={t("admin:version.more", { name })}
                onAction={(key) => {
                  if (key === "add-question") {
                    onAction({ kind: "add-question", section });
                  } else if (key === "reorder-sections") {
                    onAction({ kind: "reorder-sections" });
                  } else if (key === "reorder-questions") {
                    onAction({ kind: "reorder-questions" });
                  } else if (key === "delete") {
                    onAction({
                      kind: "delete",
                      target:
                        node.kind === "question"
                          ? { kind: "question", question: node.question }
                          : { kind: "section", section },
                    });
                  }
                }}
              >
                <MenuItem id="add-question">
                  {t(`admin:version.add.question.${words}`)}
                </MenuItem>
                {node.kind === "section" && (
                  <MenuItem id="reorder-sections">
                    {t(`admin:version.reorder.sections.${words}`)}
                  </MenuItem>
                )}
                <MenuItem id="reorder-questions">
                  {t(`admin:version.reorder.questions.${words}`)}
                </MenuItem>
                <MenuItem id="delete">
                  {node.kind === "question"
                    ? t(`admin:version.delete.question.${words}`)
                    : t(`admin:version.delete.section.${words}`)}
                </MenuItem>
              </ActionMenu>
            )}
          </Flex>
        )}
      </Flex>
      {isDraft && !isPhone ? (
        editor
      ) : (
        <Stack gap="space-300">
          <NodeFacts node={node} version={version} />
          {isDraft && (
            <Flex>
              <Button variant="secondary" onPress={() => setEditing(true)}>
                {t("admin:version.edit")}
              </Button>
            </Flex>
          )}
        </Stack>
      )}
      {isDraft && isPhone && isEditing && (
        <Dialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditing(false);
          }}
          isDismissable
          size="M"
          title={t("admin:version.editTitle", { name })}
        >
          {editor}
        </Dialog>
      )}
    </Stack>
  );
}

/** The id of the section that holds the question `id`, for the tree to open its branch. */
function parentOf(version: TemplateVersionDetail, id: string | undefined) {
  return version.sections.find((section) =>
    section.questions.some((question) => question.id === id),
  )?.id;
}

/**
 * The tree (design-spec 6.17 27, 4.5 Tree): the sections (a plan's items) with their
 * questions (its prompts), then the kind's settings. The branch of the chosen node opens
 * with it.
 */
function VersionTree({
  version,
  selected,
  onSelect,
}: {
  version: TemplateVersionDetail;
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation(["admin"]);
  const opened = parentOf(version, selected);
  const [expanded, setExpanded] = useState<Set<string | number>>(
    () => new Set(opened === undefined ? [] : [opened]),
  );
  // A node chosen from the check, or from the URL, shows inside its open branch.
  const [lastOpened, setLastOpened] = useState(opened);
  if (opened !== lastOpened) {
    setLastOpened(opened);
    if (opened !== undefined && !expanded.has(opened)) {
      setExpanded(new Set([...expanded, opened]));
    }
  }
  return (
    <Tree
      aria-label={t("admin:version.tree", {
        kind: t(`admin:kind.${version.kind}`),
      })}
      selectionMode="single"
      selectedKeys={selected === undefined ? [] : [selected]}
      onSelectionChange={(keys) => {
        const [key] = [...keys];
        // Pressing the chosen node again keeps it: the detail never goes blank.
        if (key !== undefined) onSelect(String(key));
      }}
      expandedKeys={expanded}
      onExpandedChange={setExpanded}
    >
      {version.sections.map((section) => (
        <TreeItem
          key={section.id}
          id={section.id}
          textValue={nodeName({ kind: "section", section }, t)}
          title={
            <Flex gap="space-100" alignItems="baseline">
              <Text variant="number-sm" tone="secondary">
                {section.key}
              </Text>
              <Text variant="body-compact">{section.title}</Text>
            </Flex>
          }
        >
          {section.questions.map((question) => (
            <TreeItem
              key={question.id}
              id={question.id}
              textValue={nodeName({ kind: "question", section, question }, t)}
              title={
                <Flex gap="space-100" alignItems="baseline">
                  <Text variant="number-sm" tone="secondary">
                    {question.key}
                  </Text>
                  <Text variant="body-compact">{question.title}</Text>
                </Flex>
              }
            />
          ))}
        </TreeItem>
      ))}
      {settingsNodesOf(version.kind).map((node) => (
        <TreeItem
          key={node}
          id={node}
          textValue={t(`admin:version.settings.${node}`)}
          title={
            <Text variant="body-compact">
              {t(`admin:version.settings.${node}`)}
            </Text>
          }
        />
      ))}
    </Tree>
  );
}

type CheckError = TemplateCheckResult["errors"][number];

/**
 * A problem of the check in the catalog's words (SDD 9章): AD6's `message` is for
 * developers. A part is wrong one way for a plan (each item needs one) and the other for
 * the rest (none has one).
 */
function problemText(
  error: CheckError,
  kind: TemplateKind,
  t: TFunction<["admin"]>,
): string {
  if (error.code === "invalid_part") {
    return kind === "business_plan"
      ? t("admin:version.check.code.invalid_part_plan")
      : t("admin:version.check.code.invalid_part_other");
  }
  return t(`admin:version.check.code.${error.code}`);
}

/**
 * The check before publishing (design-spec 6.17「公開の前の検査」, SDD 5.13 AD6): one row
 * per problem in a section or question, each moving to its node in the tree. Problems of
 * the whole template and the warnings, which have no node to move to, are lines under
 * the list (`CheckNotes`). Problems block publishing, warnings do not.
 */
function CheckList({
  version,
  check,
  onSelect,
}: {
  version: TemplateVersionDetail;
  check: TemplateCheckResult;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation(["admin"]);
  const rows = check.errors.flatMap((error, index) => {
    const node = error.nodeId === null ? null : findNode(version, error.nodeId);
    return node === null || error.nodeId === null
      ? []
      : [
          {
            id: `error:${index}`,
            nodeId: error.nodeId,
            text: problemText(error, version.kind, t),
            where: t("admin:version.check.in", { node: nodeName(node, t) }),
          },
        ];
  });
  return (
    <ListView
      aria-label={t("admin:version.check.list")}
      items={rows}
      onAction={(key) => {
        const row = rows.find((item) => item.id === key);
        if (row !== undefined) onSelect(row.nodeId);
      }}
      renderEmptyState={() => (
        <Text tone="secondary">
          {check.errors.length === 0
            ? t("admin:version.check.ready", {
                version: version.versionNumber,
              })
            : t("admin:version.check.noneInNodes")}
        </Text>
      )}
    >
      {(row) => (
        <ListViewItem id={row.id} textValue={row.text}>
          <Stack gap="space-50">
            <Text variant="body-compact">{row.text}</Text>
            <Text variant="caption" tone="secondary">
              {row.where}
            </Text>
          </Stack>
        </ListViewItem>
      )}
    </ListView>
  );
}

/** The check's problems of the whole template, and its warnings, as lines. */
function CheckNotes({
  version,
  check,
}: {
  version: TemplateVersionDetail;
  check: TemplateCheckResult;
}) {
  const { t } = useTranslation(["admin"]);
  const whole = check.errors.filter(
    (error) =>
      error.nodeId === null || findNode(version, error.nodeId) === null,
  );
  if (whole.length === 0 && check.warnings.length === 0) return null;
  return (
    <Stack gap="space-100">
      {whole.map((error, index) => (
        <Stack key={`error:${String(index)}`} gap="space-25">
          <Text variant="body-sm">{problemText(error, version.kind, t)}</Text>
          <Text variant="caption" tone="secondary">
            {t("admin:version.check.whole")}
          </Text>
        </Stack>
      ))}
      {check.warnings.map((warning) => (
        <Stack key={warning.keys.join(",")} gap="space-25">
          <Text variant="body-sm">
            {t("admin:version.check.removedKeys", {
              keys: formatList(warning.keys),
            })}
          </Text>
          <Text variant="caption" tone="notice">
            {t("admin:version.check.warning")}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * The title of the tree's pane: the template and version, whether it is a draft or
 * published, and for a draft "Publish as v{n}", which the check's problems block.
 */
function VersionHeader({
  version,
  check,
  isChecking,
  isSaving,
  onPublish,
  isPublishing,
}: {
  version: TemplateVersionDetail;
  check: TemplateCheckResult | undefined;
  isChecking: boolean;
  /** Input on its way or not saved: what is published must be what was typed (6.17). */
  isSaving: boolean;
  onPublish: () => void;
  isPublishing: boolean;
}) {
  const { t } = useTranslation(["admin"]);
  const { me } = useWorkspace();
  const isOnline = useIsOnline();
  // When and by whom it was published come with 26's list (AD1), not with the version.
  const templates = useQuery({
    ...adminTemplatesQuery(),
    enabled: version.status === "published",
  });
  const listed = templates.data?.items
    .find((template) => template.kind === version.kind)
    ?.versions.find((item) => item.id === version.id);
  const isDraft = version.status === "draft";
  const problems = check?.errors.length ?? 0;
  let line: string | null;
  if (isDraft) {
    line = t("admin:version.draftLine");
  } else if (listed?.publishedAt == null) {
    line = null;
  } else {
    const date = formatRelativeTime(listed.publishedAt, {
      timeZone: me.timezone,
    });
    line =
      listed.publishedBy === null
        ? t("admin:version.publishedLineNoName", { date })
        : t("admin:version.publishedLine", {
            date,
            name: listed.publishedBy.displayName,
          });
  }
  return (
    <Stack gap="space-200">
      <Stack gap="space-50">
        <Flex gap="space-200" alignItems="center" wrap>
          <Heading level={1} variant="heading-1-list">
            {t("admin:version.heading", {
              kind: t(`admin:kind.${version.kind}`),
              version: version.versionNumber,
            })}
          </Heading>
          <Badge fillStyle={isDraft ? "dashed" : "outline"}>
            {t(`admin:versionStatus.${version.status}`)}
          </Badge>
        </Flex>
        {line !== null && (
          <Text variant="caption" tone="secondary">
            {line}
          </Text>
        )}
        {templates.data === undefined && templates.isError && (
          <Flex gap="space-100" alignItems="center" wrap>
            <Text variant="caption" tone="secondary">
              {t("admin:version.publishedUnknown")}
            </Text>
            <Button
              variant="secondary"
              size="S"
              isQuiet
              onPress={() => void templates.refetch()}
            >
              {t("admin:version.retry")}
            </Button>
          </Flex>
        )}
        {!isDraft && (
          <Text variant="caption" tone="secondary">
            {t("admin:version.readOnly")}
          </Text>
        )}
      </Stack>
      {isDraft && (
        <Flex gap="space-200" alignItems="center" wrap>
          <Button
            variant="primary"
            onPress={onPublish}
            isPending={isPublishing}
            isDisabled={
              !isOnline ||
              isChecking ||
              isSaving ||
              check === undefined ||
              problems > 0
            }
          >
            {t("admin:version.publish", { version: version.versionNumber })}
          </Button>
          {problems > 0 && (
            <Text variant="caption" tone="notice">
              {t("admin:version.check.blocked", { count: problems })}
            </Text>
          )}
        </Flex>
      )}
    </Stack>
  );
}

/** The tree's pane while the version loads (design-spec 6.0.6). */
function TreeSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-200">
        {[0, 1, 2, 3].map((row) => (
          <Text key={row}>{t("admin:version.choose")}</Text>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** The tabs of the tree's pane: the contents, and for a draft the check. */
type PaneTab = "contents" | "check";

type OpenDialog = NodeAction | { kind: "add-section" };

/** The order of the version's sections and their questions, as AD5 takes it. */
const orderOf = (version: TemplateVersionDetail) =>
  version.sections.map((section) => ({
    id: section.id,
    questionIds: section.questions.map((question) => question.id),
  }));

/** Whether input of the version waits to be saved, is on its way, or failed (6.0.2). */
function useIsSaving(versionId: string) {
  const state = useAutosaveState();
  const scope = draftScope(versionId);
  return [...(state?.items.values() ?? [])].some(
    (item) =>
      item.key.startsWith(scope) &&
      (item.status !== "saved" || Object.keys(item.unsaved).length > 0),
  );
}

/** The tree, the check and the node beside them, once the version is read. */
function VersionBody({
  version,
  search,
}: {
  version: TemplateVersionDetail;
  search: TemplateVersionSearch;
}) {
  const { t } = useTranslation(["admin", "errors"]);
  const { me } = useWorkspace();
  const isTwoColumns = useTwoColumns();
  const detailHistory = useDetailHistory();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOnline = useIsOnline();
  const autosave = useAutosave();
  const sendThrough = useSendThrough();
  const isNarrow = useIsNarrow();
  // Items holding input that breaks its rules: not sent, so not saved (6.17).
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const reportHeld = useCallback(
    (itemKey: string, isHeld: boolean) =>
      setHeld((current) => {
        if (current.has(itemKey) === isHeld) return current;
        const next = new Set(current);
        if (isHeld) next.add(itemKey);
        else next.delete(itemKey);
        return next;
      }),
    [],
  );
  const isSaving = useIsSaving(version.id) || held.size > 0;
  const isDraft = version.status === "draft";
  const check = useQuery({
    ...templateCheckQuery(version.id),
    enabled: isDraft,
  });
  const [tab, setTab] = useState<PaneTab>("contents");
  const [isAsking, setAsking] = useState(false);
  const [isPublishing, setPublishing] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const busy = useRef(false);
  const [failure, setFailure] = useState<unknown>(null);
  const node = findNode(version, search.node);
  const select = (id: string) =>
    detailHistory.open({ search: { node: id } }, isTwoColumns);
  const kindLabel = t(`admin:kind.${version.kind}`);
  const words = version.kind === "business_plan" ? "plan" : "other";
  const versionKey = templateVersionKey(version.id);
  /** The version as cached now: a dialog opened before an edit sends today's order. */
  const latest = () =>
    queryClient.getQueryData<TemplateVersionDetail>(versionKey) ?? version;
  const reload = () =>
    queryClient.fetchQuery({
      ...templateVersionQuery(version.id),
      staleTime: 0,
    });

  const publish = async () => {
    if (busy.current) return;
    busy.current = true;
    setPublishing(true);
    setFailure(null);
    try {
      const published = await sendThrough(() =>
        unwrap(
          api()
            .api.v1.admin["template-versions"]({
              versionId: inPath(version.id),
            })
            .publish.post(),
        ),
      );
      await queryClient.invalidateQueries({
        queryKey: adminTemplatesQuery().queryKey,
      });
      void queryClient.invalidateQueries({ queryKey: versionKey });
      adminToast(
        t("admin:version.published", {
          kind: kindLabel,
          version: published.versionNumber,
        }),
      );
      await navigate({ href: adminTemplatesHref(version.kind) });
    } catch (error) {
      if (isSessionLost(error)) return;
      const code = failureCode(error);
      // The check found problems since it was read, or someone published it meanwhile:
      // both are read again.
      if (code === "TEMPLATE_INVALID") {
        void check.refetch();
        setTab("check");
      }
      if (
        code === "PUBLISHED_READ_ONLY" ||
        (error instanceof ApiError && error.status === 404)
      ) {
        void queryClient.invalidateQueries({ queryKey: versionKey });
      }
      setFailure(error);
    } finally {
      busy.current = false;
      setPublishing(false);
    }
  };

  /**
   * Deletes a section with its questions, or a question (AD4 DELETE). One already gone
   * counts as deleted; one published meanwhile reads the version again, read only now.
   * The deleted node's saves have nothing left to save, and its detail closes.
   */
  const remove = async (target: DeleteTarget) => {
    const ids =
      target.kind === "section"
        ? [target.section.id, ...target.section.questions.map((q) => q.id)]
        : [target.question.id];
    try {
      await sendThrough(() =>
        target.kind === "section"
          ? unwrap(
              api()
                .api.v1.admin["template-sections"]({
                  id: inPath(target.section.id),
                })
                .delete(),
            )
          : unwrap(
              api()
                .api.v1.admin["template-questions"]({
                  id: inPath(target.question.id),
                })
                .delete(),
            ),
      );
    } catch (error) {
      if (isSessionLost(error)) return;
      const code = failureCode(error);
      if (code === "PUBLISHED_READ_ONLY") {
        void queryClient.invalidateQueries({ queryKey: versionKey });
        adminToast(t("admin:version.alreadyPublished"));
        return;
      }
      if (code !== "NOT_FOUND") {
        toastFailure(error, () => void remove(target));
        return;
      }
    }
    const keys = [
      ...(target.kind === "section"
        ? [sectionItemKey(version.id, target.section.id)]
        : []),
      ...(target.kind === "section"
        ? target.section.questions.map((q) => questionItemKey(version.id, q.id))
        : [questionItemKey(version.id, target.question.id)]),
    ];
    for (const key of keys) {
      const item = autosave.getState().items.get(key);
      if (item !== undefined) autosave.discard(key, Object.keys(item.unsaved));
    }
    void queryClient.invalidateQueries({ queryKey: versionKey });
    if (search.node !== undefined && ids.includes(search.node)) {
      detailHistory.close({ search: {} });
      // The ⋯ that asked went with the node: the keyboard goes to the tree, on the row
      // it keeps in the Tab order.
      requestAnimationFrame(() =>
        (
          document.querySelector<HTMLElement>(
            '[role="treegrid"] [role="row"][tabindex="0"]',
          ) ?? document.querySelector<HTMLElement>('[role="treegrid"]')
        )?.focus(),
      );
    }
  };

  const sendOrder = async (sections: ReturnType<typeof orderOf>) => {
    putVersion(
      queryClient,
      await sendThrough(() =>
        unwrap(
          api()
            .api.v1.admin["template-versions"]({
              versionId: inPath(version.id),
            })
            .order.put({ sections }),
        ),
      ),
    );
  };

  let checkList: ReactNode;
  if (check.data !== undefined) {
    checkList = (
      <CheckList
        version={version}
        check={check.data}
        onSelect={(id) => {
          // To the node in the tree (design-spec 6.17「ツリーの該当のノードへ移れる」).
          setTab("contents");
          select(id);
        }}
      />
    );
  } else if (check.isError) {
    checkList = (
      <FailureState
        error={check.error}
        onRetry={() => void check.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  } else {
    checkList = <TreeSkeleton />;
  }
  const problems = check.data?.errors.length;
  const sectionLabel = (section: Section) =>
    t("admin:version.sectionName", { key: section.key, title: section.title });
  const questionLabel = (question: Question) =>
    t("admin:version.questionName", {
      key: question.key,
      title: question.title,
    });
  const groupsOf = (current: TemplateVersionDetail) =>
    current.sections.map((section) => ({
      id: section.id,
      label: sectionLabel(section),
      items: section.questions.map((question) => ({
        id: question.id,
        label: questionLabel(question),
      })),
    }));
  const addSection = {
    label: t(`admin:version.add.section.${words}`),
    onPress: () => setDialog({ kind: "add-section" }),
  };
  let listNote: ReactNode;
  if (isDraft && tab === "check") {
    listNote =
      check.data === undefined ? undefined : (
        <CheckNotes version={version} check={check.data} />
      );
  } else if (isDraft && !isNarrow) {
    // Under the tree, not at the title's end: Publish is the pane's primary action.
    listNote = (
      <Flex>
        <Button
          variant="secondary"
          isQuiet
          onPress={addSection.onPress}
          isDisabled={!isOnline}
        >
          <Plus />
          {addSection.label}
        </Button>
      </Flex>
    );
  }
  return (
    <HeldInputContext.Provider value={reportHeld}>
      <ListDetailPattern
        header={
          <Stack gap="space-200">
            <VersionHeader
              version={version}
              check={check.data}
              isChecking={check.isFetching}
              isSaving={isSaving}
              onPublish={() => setAsking(true)}
              isPublishing={isPublishing}
            />
            {failure !== null && (
              <SendFailure
                error={failure}
                messages={{
                  TEMPLATE_INVALID: t("admin:version.publishInvalid"),
                  PUBLISHED_READ_ONLY: t("admin:version.alreadyPublished"),
                }}
                transient="couldNotSave"
                withSaveReasons
                onRetry={() => void publish()}
                isRetryDisabled={!isOnline || isPublishing}
              />
            )}
          </Stack>
        }
        tabs={
          isDraft
            ? {
                "aria-label": t("admin:version.tabs.label"),
                items: [
                  { id: "contents", label: t("admin:version.tabs.contents") },
                  {
                    id: "check",
                    label:
                      problems === undefined || problems === 0
                        ? t("admin:version.tabs.check")
                        : t("admin:version.tabs.checkCount", {
                            count: problems,
                          }),
                  },
                ],
                selectedKey: tab,
                onSelectionChange: (key) =>
                  setTab(key === "check" ? "check" : "contents"),
              }
            : undefined
        }
        list={
          isDraft && tab === "check" ? (
            checkList
          ) : (
            <VersionTree
              version={version}
              selected={node === null ? undefined : search.node}
              onSelect={select}
            />
          )
        }
        listNote={listNote}
        // A phone's new item floats at the bottom right (4.1 D).
        newItem={
          isDraft && tab === "contents" && isNarrow ? addSection : undefined
        }
        detail={
          // In one pane the list shows until a node is chosen; beside it, what to do.
          node !== null ? (
            <NodeDetail node={node} version={version} onAction={setDialog} />
          ) : isTwoColumns ? (
            <ChooseNode />
          ) : null
        }
        listLabel={kindLabel}
        onBack={() => detailHistory.close({ search: {} })}
      />
      {isAsking && (
        <AlertDialog
          isOpen
          size="S"
          title={t("admin:version.publishTitle", {
            version: version.versionNumber,
          })}
          primaryActionLabel={t("admin:version.publishAction")}
          cancelLabel={t("admin:version.cancel")}
          onPrimaryAction={() => {
            setAsking(false);
            void publish();
          }}
          onCancel={() => setAsking(false)}
        >
          {t("admin:version.publishBody", { version: version.versionNumber })}
        </AlertDialog>
      )}
      {dialog?.kind === "add-section" && (
        <AddSectionDialog
          version={version}
          onClose={() => setDialog(null)}
          onAdded={select}
        />
      )}
      {dialog?.kind === "add-question" && (
        <AddQuestionDialog
          version={version}
          section={dialog.section}
          onClose={() => setDialog(null)}
          onAdded={select}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteNodeDialog
          version={version}
          target={dialog.target}
          onDelete={() => void remove(dialog.target)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "preview" && (
        <PreviewDialog
          version={version}
          section={
            version.sections.find(
              (section) => section.id === dialog.section.id,
            ) ?? dialog.section
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "reorder-sections" && (
        <ReorderDialog
          title={t(`admin:version.reorder.sectionsTitle.${words}`)}
          items={version.sections.map((section) => ({
            id: section.id,
            label: sectionLabel(section),
          }))}
          listPath="sections"
          send={(ids) => {
            const questions = new Map(
              orderOf(latest()).map((entry) => [entry.id, entry.questionIds]),
            );
            return sendOrder(
              ids.map((id) => ({ id, questionIds: questions.get(id) ?? [] })),
            );
          }}
          reload={async () =>
            (await reload()).sections.map((section) => ({
              id: section.id,
              label: sectionLabel(section),
            }))
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "reorder-questions" && (
        <ReorderGroupedDialog
          title={t(`admin:version.reorder.questionsTitle.${words}`)}
          groups={groupsOf(version)}
          emptyText={t(`admin:version.reorder.noQuestions.${words}`)}
          listPath="sections"
          send={(order) =>
            sendOrder(
              order.map((group) => ({
                id: group.id,
                questionIds: group.itemIds,
              })),
            )
          }
          reload={async () => groupsOf(await reload())}
          onClose={() => setDialog(null)}
        />
      )}
    </HeldInputContext.Provider>
  );
}

/** 27's shape while its route loads (design-spec 6.0.6). */
export function TemplateVersionSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <ListDetailPattern
      header={
        <Skeleton isLoading>
          <Heading level={1} variant="heading-1-list">
            {t("admin:version.title")}
          </Heading>
        </Skeleton>
      }
      list={<TreeSkeleton />}
      detail={null}
      listLabel={t("admin:templates.title")}
      onBack={() => {}}
    />
  );
}

/** Reads the version, then shows it; the states of 6.0.6 in its place until then. */
function VersionLoader({
  versionId,
  search,
}: {
  versionId: string;
  search: TemplateVersionSearch;
}) {
  const { me } = useWorkspace();
  const query = useQuery(templateVersionQuery(versionId));
  const isSlow = useIsSlow(query.isPending);
  if (query.data !== undefined) {
    return <VersionBody version={query.data} search={search} />;
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <NotFoundState dashboardHref={dashboardHref(me)} />;
    }
    return (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  if (isSlow) return <SlowLoadingState onRetry={() => void query.refetch()} />;
  return <TemplateVersionSkeleton />;
}

/**
 * 27 Admin: Edit Template (design-spec 6.17, pattern D with a tree): the version's
 * sections and questions, then its kind's settings, the chosen one beside them; for a
 * draft, the check before publishing and "Publish as v{n}". A published version only
 * shows. Operators only: anyone else is told they have no access (6.0.6).
 */
export function TemplateVersionScreen({
  versionId,
  search,
}: {
  versionId: string;
  search: TemplateVersionSearch;
}) {
  const { t } = useTranslation(["admin"]);
  const { me } = useWorkspace();
  const { data: version } = useQuery({
    ...templateVersionQuery(versionId),
    enabled: me.isAdmin,
  });
  // Named once there is a version to name: not found has no name (design-spec 6.0.1).
  const isNamed = me.isAdmin && version !== undefined;
  useDocumentTitle(...(isNamed ? [t("admin:version.title")] : []));
  const templatesHref = adminTemplatesHref(version?.kind);
  return (
    <WorkspaceFrame
      current="admin"
      saveScope={draftScope(versionId)}
      back={
        me.isAdmin
          ? { label: t("admin:templates.title"), href: templatesHref }
          : undefined
      }
      breadcrumbs={
        me.isAdmin ? (
          <Breadcrumbs>
            <Breadcrumb href={templatesHref}>{t("admin:title")}</Breadcrumb>
            {isNamed && <Breadcrumb>{t("admin:version.title")}</Breadcrumb>}
          </Breadcrumbs>
        ) : undefined
      }
    >
      {me.isAdmin ? (
        <VersionLoader versionId={versionId} search={search} />
      ) : (
        <NoAccessState dashboardHref={dashboardHref(me)} />
      )}
    </WorkspaceFrame>
  );
}
