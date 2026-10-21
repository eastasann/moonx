import { formatList, formatRelativeTime } from "@moonx/i18n";
import {
  type CostCategory,
  type TemplateCheckResult,
  type TemplateKind,
  type TemplateVersionDetail,
  THRESHOLD_CHECK_KEYS,
} from "@moonx/schemas";
import {
  AlertDialog,
  Badge,
  Breadcrumb,
  Breadcrumbs,
  Button,
  DescriptionList,
  DescriptionListItem,
  Flex,
  Heading,
  IllustratedMessage,
  ListDetailPattern,
  ListView,
  ListViewItem,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  Text,
  Tree,
  TreeItem,
  useTwoColumns,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { MousePointerClick } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminToast, useDetailHistory } from "../components/admin";
import { failureCode, SendFailure } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useWorkspace } from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
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
import { useDocumentTitle } from "../lib/title";

/** `/admin/templates/versions/$versionId`'s search parameters (SDD 4章). */
export interface TemplateVersionSearch {
  /** The node of the tree shown beside it: a section's or question's id, or a setting. */
  node?: string;
}

type Section = TemplateVersionDetail["sections"][number];
type Question = Section["questions"][number];

/** A node of 27's tree (design-spec 6.17 27). */
type TreeNode =
  | { kind: "section"; section: Section }
  | { kind: "question"; section: Section; question: Question }
  | { kind: "settings"; node: SettingsNode };

/**
 * The settings at the end of the tree that the template's kind holds (design-spec 6.17):
 * the AI prompt only for a self analysis, the cost rows and check thresholds only for a
 * validation, the execution rows only for a plan.
 */
export function settingsNodesOf(kind: TemplateKind): SettingsNode[] {
  if (kind === "self_analysis") return ["ai-prompt"];
  if (kind === "validation") return ["cost-defaults", "check-rules"];
  return ["execution-presets"];
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
function SectionDetail({
  section,
  kind,
}: {
  section: Section;
  kind: TemplateKind;
}) {
  const { t } = useTranslation(["admin"]);
  return (
    <Stack gap="space-300">
      <Heading level={2}>{section.title}</Heading>
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
    </Stack>
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
function QuestionDetail({
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
    <Stack gap="space-300">
      <Stack gap="space-50">
        <Text variant="number-sm" tone="secondary">
          {question.key}
        </Text>
        <Heading level={2}>{question.title}</Heading>
      </Stack>
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
    </Stack>
  );
}

const COST_CATEGORIES = [
  "initial",
  "monthly_fixed",
  "variable",
] as const satisfies readonly CostCategory[];

/** The thresholds of each check and their names, in the order design-spec 6.1 tells them. */
const CHECK_PARAMS = {
  competitors: [["min", "admin:checkRule.competitors.min"]],
  local_price: [
    ["pricedCompetitors", "admin:checkRule.local_price.pricedCompetitors"],
    ["researchLogs", "admin:checkRule.local_price.researchLogs"],
  ],
  permits: [["researchLogs", "admin:checkRule.permits.researchLogs"]],
  demand_signal: [
    ["researchLogs", "admin:checkRule.demand_signal.researchLogs"],
  ],
} as const;

/** A setting at the end of the tree as it stands (design-spec 6.17). */
function SettingsDetail({
  node,
  version,
}: {
  node: SettingsNode;
  version: TemplateVersionDetail;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const title = t(`admin:version.settings.${node}`);
  let body: ReactNode;
  if (node === "ai-prompt") {
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
  return (
    <Stack gap="space-300">
      <Heading level={2}>{title}</Heading>
      {body}
    </Stack>
  );
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

/** The selected node beside the tree. */
function NodeDetail({
  node,
  version,
}: {
  node: TreeNode;
  version: TemplateVersionDetail;
}) {
  if (node.kind === "section") {
    return <SectionDetail section={node.section} kind={version.kind} />;
  }
  if (node.kind === "question") {
    return <QuestionDetail question={node.question} kind={version.kind} />;
  }
  return <SettingsDetail node={node.node} version={version} />;
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
  onPublish,
  isPublishing,
}: {
  version: TemplateVersionDetail;
  check: TemplateCheckResult | undefined;
  isChecking: boolean;
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
              !isOnline || isChecking || check === undefined || problems > 0
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
  const sendThrough = useSendThrough();
  const isDraft = version.status === "draft";
  const check = useQuery({
    ...templateCheckQuery(version.id),
    enabled: isDraft,
  });
  const [tab, setTab] = useState<PaneTab>("contents");
  const [isAsking, setAsking] = useState(false);
  const [isPublishing, setPublishing] = useState(false);
  const busy = useRef(false);
  const [failure, setFailure] = useState<unknown>(null);
  const node = findNode(version, search.node);
  const select = (id: string) =>
    detailHistory.open({ search: { node: id } }, isTwoColumns);
  const kindLabel = t(`admin:kind.${version.kind}`);

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
      void queryClient.invalidateQueries({
        queryKey: templateVersionKey(version.id),
      });
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
        void queryClient.invalidateQueries({
          queryKey: templateVersionKey(version.id),
        });
      }
      setFailure(error);
    } finally {
      busy.current = false;
      setPublishing(false);
    }
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
  return (
    <>
      <ListDetailPattern
        header={
          <Stack gap="space-200">
            <VersionHeader
              version={version}
              check={check.data}
              isChecking={check.isFetching}
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
        listNote={
          isDraft && tab === "check" && check.data !== undefined ? (
            <CheckNotes version={version} check={check.data} />
          ) : undefined
        }
        detail={
          // In one pane the list shows until a node is chosen; beside it, what to do.
          node !== null ? (
            <NodeDetail node={node} version={version} />
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
    </>
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
