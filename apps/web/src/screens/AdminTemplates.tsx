import { formatRelativeTime } from "@moonx/i18n";
import {
  type AdminTemplateList,
  TEMPLATE_FILE_MAX_BYTES,
  type TemplateKind,
  templateKindSchema,
} from "@moonx/schemas";
import {
  ActionMenu,
  Badge,
  Breadcrumb,
  Breadcrumbs,
  Button,
  FileTrigger,
  Flex,
  Heading,
  IllustratedMessage,
  InlineAlert,
  ListDetailPattern,
  ListView,
  ListViewItem,
  MenuItem,
  Skeleton,
  Stack,
  Text,
  useTwoColumns,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { FileJson, FileUp } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  adminToast,
  useAdminTabs,
  useDetailHistory,
} from "../components/admin";
import { failureCode, SendFailure } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useWorkspace } from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { readUtf8 } from "../lib/files";
import { adminTemplatesHref, templateVersionHref } from "../lib/links";
import { useIsOnline } from "../lib/online";
import { adminTemplatesQuery } from "../lib/queries";
import { isSessionLost, useSendThrough } from "../lib/send";
import { useDocumentTitle } from "../lib/title";

/** `/admin/templates`'s search parameters (SDD 4章). */
export interface AdminTemplatesSearch {
  /** The template whose versions show beside the list. */
  kind?: TemplateKind;
}

type Template = AdminTemplateList["items"][number];
type Version = Template["versions"][number];

/** The draft of a template, which can have one at most (design-spec 6.17). */
const draftOf = (template: Template) =>
  template.versions.find((version) => version.status === "draft");

/** Its newest published version. */
const latestOf = (template: Template) =>
  template.versions.find((version) => version.status === "published");

/** The breadcrumbs of 26 and 28: "Admin / {screen}" (design-spec 6.0.1). */
export function AdminBreadcrumbs({ screen }: { screen: string }) {
  const { t } = useTranslation(["admin"]);
  return (
    <Breadcrumbs>
      <Breadcrumb href={adminTemplatesHref()}>{t("admin:title")}</Breadcrumb>
      <Breadcrumb>{screen}</Breadcrumb>
    </Breadcrumbs>
  );
}

/** The title of the list's pane of 26 and 28: the operator's screens as one place. */
export function AdminHeading() {
  const { t } = useTranslation(["admin"]);
  return (
    <Heading level={1} variant="heading-1-list">
      {t("admin:title")}
    </Heading>
  );
}

/**
 * A template's row (design-spec 6.17 26): its kind, and where its versions stand, or that
 * it has none yet.
 */
function TemplateRow({ template }: { template: Template }) {
  const { t } = useTranslation(["admin", "app"]);
  const latest = latestOf(template);
  const draft = draftOf(template);
  const line =
    template.versions.length === 0
      ? t("admin:templates.noVersions")
      : [
          ...(latest === undefined
            ? []
            : [
                t("admin:templates.row.published", {
                  version: latest.versionNumber,
                }),
              ]),
          ...(draft === undefined
            ? []
            : [
                t("admin:templates.row.draft", {
                  version: draft.versionNumber,
                }),
              ]),
        ].join(t("app:separator"));
  return (
    <Stack gap="space-50">
      <Text variant="label">{t(`admin:kind.${template.kind}`)}</Text>
      <Text variant="caption" tone="secondary">
        {line}
      </Text>
    </Stack>
  );
}

/** A version's line under its number: when and by whom it was published, and its use. */
function versionLine(
  version: Version,
  timeZone: string,
  t: TFunction<["admin"]>,
) {
  if (version.status === "draft") return t("admin:templates.draftLine");
  const usage = t("admin:templates.usage", { count: version.usageCount });
  if (version.publishedAt === null) return usage;
  const date = formatRelativeTime(version.publishedAt, { timeZone });
  return version.publishedBy === null
    ? t("admin:templates.publishedLineNoName", { date, usage })
    : t("admin:templates.publishedLine", {
        date,
        name: version.publishedBy.displayName,
        usage,
      });
}

/** Why an import made no draft (design-spec 6.17「ファイルからの取り込み」). */
type ImportProblem =
  | { kind: "tooLarge" }
  | { kind: "unreadable" }
  | { kind: "otherKind"; fileKind: TemplateKind | null }
  | { kind: "format"; paths: string[] }
  | { kind: "draftExists" }
  | { kind: "failed"; error: unknown; retry: () => void };

/** How many of the places of a broken file are told (the first ones). */
const SHOWN_PLACES = 5;

/**
 * The places a 422 VALIDATION_FAILED names (SDD 8.1 `details`), once each. Their
 * `message` is for developers and never shown (SDD 9章「入力の検査の文言」).
 */
function pathsOf(error: ApiError): string[] {
  const details = error.detail.details;
  if (!Array.isArray(details)) return [];
  const paths = details.flatMap((detail: unknown) => {
    if (typeof detail !== "object" || detail === null) return [];
    const { path } = detail as Record<string, unknown>;
    return typeof path === "string" ? [path] : [];
  });
  return [...new Set(paths)];
}

/** The kind a file says it is, when it says one moonx knows. */
const fileKindOf = (body: unknown): TemplateKind | null =>
  typeof body === "object" && body !== null && "kind" in body
    ? (templateKindSchema.safeParse(body.kind).data ?? null)
    : null;

/**
 * The selected template beside the list (design-spec 6.17 26): its versions, newest
 * first, each opening 27 (a draft to edit, a published one read-only), and making a draft
 * from a published one; Import from file. A template has one draft at most: while it has
 * one, both ways to make another are unavailable and the draft is pointed to.
 */
function TemplateDetail({ template }: { template: Template }) {
  const { t } = useTranslation(["admin", "app", "errors"]);
  const { me } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOnline = useIsOnline();
  const sendThrough = useSendThrough();
  const [sending, setSending] = useState<string | null>(null);
  const busy = useRef(false);
  const [problem, setProblem] = useState<ImportProblem | null>(null);
  const draft = draftOf(template);
  const kindLabel = t(`admin:kind.${template.kind}`);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: adminTemplatesQuery().queryKey });

  /** One action at a time: an import or a new draft. */
  const act = async (key: string, work: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setSending(key);
    setProblem(null);
    try {
      await work();
    } finally {
      busy.current = false;
      setSending(null);
    }
  };
  /** Takes a failed send: a draft made meanwhile (another tab) is read and pointed to. */
  const fail = (error: unknown, retry: () => void) => {
    if (isSessionLost(error)) return;
    if (failureCode(error) === "DRAFT_EXISTS") {
      setProblem({ kind: "draftExists" });
      void refresh();
      return;
    }
    if (error instanceof ApiError && error.status === 404) void refresh();
    setProblem({ kind: "failed", error, retry });
  };

  const send = (body: unknown): Promise<void> =>
    act("import", async () => {
      try {
        const made = await sendThrough(() =>
          unwrap(
            api().api.v1.admin.templates.import.post(body as never, {
              query: { kind: template.kind },
            }),
          ),
        );
        await refresh();
        adminToast(
          t("admin:templates.imported", { version: made.versionNumber }),
        );
        await navigate({ href: templateVersionHref(made.versionId) });
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === "VALIDATION_FAILED" &&
          error.status === 422
        ) {
          // An issue at `kind` is a file of another kind; the rest, a format that cannot
          // be read, told with its places (SDD 9章「入力の検査の文言」).
          const paths = pathsOf(error);
          setProblem(
            paths.includes("kind")
              ? { kind: "otherKind", fileKind: fileKindOf(body) }
              : { kind: "format", paths },
          );
          return;
        }
        fail(error, () => void send(body));
      }
    });
  const importFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (file === undefined) return;
    if (file.size > TEMPLATE_FILE_MAX_BYTES) {
      setProblem({ kind: "tooLarge" });
      return;
    }
    const text = await readUtf8(file);
    let body: unknown;
    try {
      body = text === null ? undefined : JSON.parse(text);
    } catch {
      body = undefined;
    }
    // A template file is a JSON object; anything else is no template file to send.
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      setProblem({ kind: "unreadable" });
      return;
    }
    await send(body);
  };
  const newDraft = (version: Version): Promise<void> =>
    act(`draft:${version.id}`, async () => {
      try {
        const made = await sendThrough(() =>
          unwrap(
            api()
              .api.v1.admin["template-versions"]({
                versionId: inPath(version.id),
              })
              .draft.post(),
          ),
        );
        await refresh();
        adminToast(
          t("admin:templates.drafted", { version: version.versionNumber }),
        );
        await navigate({ href: templateVersionHref(made.id) });
      } catch (error) {
        fail(error, () => void newDraft(version));
      }
    });

  const importButton = (
    <FileTrigger
      acceptedFileTypes={[".json", "application/json"]}
      onSelect={(files) => void importFile(files)}
    >
      <Button
        variant={template.versions.length === 0 ? "primary" : "secondary"}
        isDisabled={!isOnline || draft !== undefined || sending !== null}
        isPending={sending === "import"}
      >
        <FileUp />
        {t("admin:templates.import")}
      </Button>
    </FileTrigger>
  );
  let problemNote: ReactNode = null;
  if (problem !== null) {
    if (problem.kind === "failed") {
      problemNote = (
        <SendFailure
          error={problem.error}
          transient="couldNotSave"
          withSaveReasons
          onRetry={problem.retry}
          isRetryDisabled={!isOnline || sending !== null}
        />
      );
    } else if (problem.kind === "format") {
      problemNote = (
        <InlineAlert
          variant="negative"
          title={t("admin:templates.importErrors.format")}
        >
          <Stack gap="space-50">
            {problem.paths.slice(0, SHOWN_PLACES).map((path) => (
              <Text key={path} variant="body-sm">
                {path === ""
                  ? t("admin:templates.importErrors.atTop")
                  : t("admin:templates.importErrors.at", { path })}
              </Text>
            ))}
            {problem.paths.length > SHOWN_PLACES && (
              <Text variant="body-sm" tone="secondary">
                {t("admin:templates.importErrors.more", {
                  count: problem.paths.length - SHOWN_PLACES,
                })}
              </Text>
            )}
          </Stack>
        </InlineAlert>
      );
    } else {
      problemNote = (
        <InlineAlert variant="negative">
          {problem.kind !== "otherKind"
            ? t(`admin:templates.importErrors.${problem.kind}`)
            : problem.fileKind === null
              ? t("admin:templates.importErrors.notThisKind", {
                  kind: kindLabel,
                })
              : t("admin:templates.importErrors.otherKind", {
                  kind: t(`admin:kind.${problem.fileKind}`),
                })}
        </InlineAlert>
      );
    }
  }

  return (
    <Stack gap="space-300">
      <Stack gap="space-100">
        <Heading level={2}>{kindLabel}</Heading>
        {template.name !== null && template.name !== kindLabel && (
          <Text tone="secondary">{template.name}</Text>
        )}
      </Stack>
      {draft !== undefined && (
        <InlineAlert variant="informative">
          <Flex gap="space-200" wrap alignItems="center">
            <Text>
              {t("admin:templates.draftOpen", {
                version: draft.versionNumber,
              })}
            </Text>
            <Button
              variant="secondary"
              size="S"
              onPress={() =>
                void navigate({ href: templateVersionHref(draft.id) })
              }
            >
              {t("admin:templates.openDraft", {
                version: draft.versionNumber,
              })}
            </Button>
          </Flex>
        </InlineAlert>
      )}
      {template.versions.length === 0 ? (
        <IllustratedMessage
          headingLevel={3}
          size="S"
          icon={<FileJson />}
          heading={t("admin:templates.empty")}
          actions={importButton}
        />
      ) : (
        <>
          <Flex>{importButton}</Flex>
          {problemNote}
          <Stack gap="space-100">
            <Heading level={3} variant="label">
              {t("admin:templates.versions")}
            </Heading>
            <ListView
              aria-label={t("admin:templates.versionsOf", { kind: kindLabel })}
              items={template.versions}
              dependencies={[draft?.id, sending, isOnline, me.timezone]}
            >
              {(version) => (
                <ListViewItem
                  id={version.id}
                  textValue={t("admin:templates.version", {
                    version: version.versionNumber,
                  })}
                  href={templateVersionHref(version.id)}
                  actions={
                    <ActionMenu
                      aria-label={t("admin:templates.versionMenu", {
                        version: version.versionNumber,
                      })}
                      disabledKeys={
                        !isOnline || draft !== undefined || sending !== null
                          ? ["new-draft"]
                          : []
                      }
                      onAction={(key) => {
                        if (key === "new-draft") void newDraft(version);
                      }}
                    >
                      {version.status === "draft" ? (
                        <MenuItem
                          id="open"
                          href={templateVersionHref(version.id)}
                        >
                          {t("admin:templates.openDraft", {
                            version: version.versionNumber,
                          })}
                        </MenuItem>
                      ) : (
                        <>
                          <MenuItem
                            id="view"
                            href={templateVersionHref(version.id)}
                          >
                            {t("admin:templates.view")}
                          </MenuItem>
                          <MenuItem id="new-draft">
                            {t("admin:templates.newDraft")}
                          </MenuItem>
                        </>
                      )}
                    </ActionMenu>
                  }
                >
                  <Stack gap="space-50">
                    <Flex gap="space-200" alignItems="center">
                      <Text variant="label">
                        {t("admin:templates.version", {
                          version: version.versionNumber,
                        })}
                      </Text>
                      <Badge
                        fillStyle={
                          version.status === "draft" ? "dashed" : "outline"
                        }
                      >
                        {t(`admin:versionStatus.${version.status}`)}
                      </Badge>
                    </Flex>
                    <Text variant="caption" tone="secondary">
                      {versionLine(version, me.timezone, t)}
                    </Text>
                  </Stack>
                </ListViewItem>
              )}
            </ListView>
          </Stack>
        </>
      )}
      {template.versions.length === 0 && problemNote}
    </Stack>
  );
}

/** Rows of placeholder words in the shape of the list (design-spec 6.0.6). */
function TemplatesListSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {(["self_analysis", "validation", "business_plan"] as const).map(
          (kind) => (
            <Stack key={kind} gap="space-50">
              <Text variant="label">{t(`admin:kind.${kind}`)}</Text>
              <Text variant="caption">{t("admin:templates.noVersions")}</Text>
            </Stack>
          ),
        )}
      </Stack>
    </Skeleton>
  );
}

function TemplatesBody({ search }: { search: AdminTemplatesSearch }) {
  const { t } = useTranslation(["admin"]);
  const { me } = useWorkspace();
  const isTwoColumns = useTwoColumns();
  const detailHistory = useDetailHistory();
  const tabs = useAdminTabs("templates");
  const query = useQuery(adminTemplatesQuery());
  const isSlow = useIsSlow(query.isPending);
  const items = query.data?.items ?? [];
  const selected =
    items.find(({ kind }) => kind === search.kind) ??
    // Beside the list there is always a template to show: the first, until one is chosen.
    (isTwoColumns ? items[0] : undefined);

  let list: ReactNode;
  // What is read stays when reading it again fails (ADR-011): the failure shows only
  // in place of a list never read.
  if (query.data === undefined) {
    if (query.isError) {
      list = (
        <FailureState
          error={query.error}
          onRetry={() => void query.refetch()}
          dashboardHref={dashboardHref(me)}
          headingLevel={2}
          size="S"
        />
      );
    } else if (isSlow) {
      list = (
        <SlowLoadingState
          headingLevel={2}
          size="S"
          onRetry={() => void query.refetch()}
        />
      );
    } else {
      list = <TemplatesListSkeleton />;
    }
  } else {
    list = (
      <ListView
        aria-label={t("admin:templates.list")}
        items={items}
        selectionMode="single"
        selectedKeys={selected === undefined ? [] : [selected.kind]}
        onSelectionChange={(keys) => {
          const kind = templateKindSchema.safeParse([...keys][0]);
          if (kind.success) {
            detailHistory.open({ search: { kind: kind.data } }, isTwoColumns);
          }
        }}
      >
        {(template) => (
          <ListViewItem
            id={template.kind}
            textValue={t(`admin:kind.${template.kind}`)}
          >
            <TemplateRow template={template} />
          </ListViewItem>
        )}
      </ListView>
    );
  }
  return (
    <ListDetailPattern
      header={<AdminHeading />}
      tabs={tabs}
      list={list}
      detail={
        selected === undefined ? null : (
          <TemplateDetail key={selected.kind} template={selected} />
        )
      }
      listLabel={t("admin:templates.title")}
      onBack={() => detailHistory.close({ search: {} })}
    />
  );
}

/** 26's shape while its route loads (design-spec 6.0.6). */
export function AdminTemplatesSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <ListDetailPattern
      header={<AdminHeading />}
      list={<TemplatesListSkeleton />}
      detail={null}
      listLabel={t("admin:templates.title")}
      onBack={() => {}}
    />
  );
}

/**
 * 26 Admin: Templates (design-spec 6.17, pattern D): the three templates, and the chosen
 * one's versions beside them with Import from file. Operators only: anyone else is told
 * they have no access (6.0.6), as the API refuses them.
 */
export function AdminTemplatesScreen({
  search,
}: {
  search: AdminTemplatesSearch;
}) {
  const { t } = useTranslation(["admin"]);
  const { me } = useWorkspace();
  useDocumentTitle(...(me.isAdmin ? [t("admin:templates.title")] : []));
  return (
    <WorkspaceFrame
      current="admin"
      breadcrumbs={
        // The screen has no name for anyone else (design-spec 6.0.1): no way in shows.
        me.isAdmin ? (
          <AdminBreadcrumbs screen={t("admin:templates.title")} />
        ) : undefined
      }
    >
      {me.isAdmin ? (
        <TemplatesBody search={search} />
      ) : (
        <NoAccessState dashboardHref={dashboardHref(me)} />
      )}
    </WorkspaceFrame>
  );
}
