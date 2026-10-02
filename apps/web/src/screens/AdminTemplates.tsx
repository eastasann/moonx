import { formatDate } from "@moonx/i18n";
import {
  Badge,
  Button,
  Flex,
  Heading,
  InlineAlert,
  ListDetailPattern,
  ListView,
  ListViewItem,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  Text,
  useBelowDesktop,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { QueryBoundary } from "../components/states";
import { type AdminTemplate, adminTemplatesQuery, useCreateDraft } from "../lib/admin-templates";
import { errorText } from "../lib/error-text";
import { useGoTo } from "../lib/navigate";
import { useMe } from "../lib/session";
import { toasts } from "../lib/toast";
import { AdminTabs } from "./admin/AdminTabs";

const KINDS = ["self_analysis", "validation", "business_plan"] as const;
type Kind = (typeof KINDS)[number];

const kindOf = (kind: string | undefined): Kind | undefined =>
  KINDS.find((candidate) => candidate === kind);

const latestPublished = (template: AdminTemplate) =>
  Math.max(
    0,
    ...template.versions.filter((v) => v.status === "published").map((v) => v.versionNumber),
  );

function ListSkeleton() {
  return (
    <Stack gap="space-200">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} shape="block" height="space-800" />
      ))}
    </Stack>
  );
}

/**
 * Screen 26, Templates (design-spec 6.17, pattern D): the three templates on the left, the chosen
 * one's versions on the right. A new draft copies a version; a template has one draft at a time.
 * Below desktop the list shows until a template is chosen (`?kind=`).
 */
export function AdminTemplates({
  kind,
  onKindChange,
}: {
  kind: string | undefined;
  onKindChange: (kind: Kind | undefined) => void;
}) {
  const { t } = useTranslation("admin");
  const query = useQuery(adminTemplatesQuery);
  const compact = useBelowDesktop();
  const chosen = kindOf(kind);

  return (
    <QueryBoundary query={query} skeleton={<ListSkeleton />}>
      {({ items }) => {
        const template = items.find((item) => item.kind === (chosen ?? KINDS[0]));
        return (
          <ListDetailPattern
            header={
              <Stack gap="space-200">
                <Heading level={1}>{t("templates.title")}</Heading>
                <AdminTabs current="templates" />
              </Stack>
            }
            detailOpen={compact && chosen !== undefined}
            list={
              <ListView
                aria-label={t("templates.listLabel")}
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={new Set(template ? [template.kind] : [])}
                onSelectionChange={(keys) => {
                  const [key] = keys === "all" ? [] : keys;
                  const next = kindOf(key === undefined ? undefined : String(key));
                  if (next) onKindChange(next);
                }}
              >
                {items.map((item) => (
                  <ListViewItem key={item.kind} id={item.kind} textValue={item.name}>
                    <Flex justify="between" align="center" gap="space-200">
                      <Text as="span">{item.name}</Text>
                      <Text as="span" variant="caption" tone="secondary">
                        {t("templates.latest", { number: latestPublished(item) })}
                      </Text>
                    </Flex>
                  </ListViewItem>
                ))}
              </ListView>
            }
            detail={
              template ? (
                <Versions
                  template={template}
                  onBack={compact ? () => onKindChange(undefined) : undefined}
                />
              ) : null
            }
          />
        );
      }}
    </QueryBoundary>
  );
}

function Versions({ template, onBack }: { template: AdminTemplate; onBack?: () => void }) {
  const { t } = useTranslation(["admin", "app"]);
  const me = useMe();
  const goTo = useGoTo();
  const createDraft = useCreateDraft();
  const draft = template.versions.find((version) => version.status === "draft");
  const versions = [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const openVersion = (id: string) => goTo(`/admin/templates/versions/${id}`);

  const copy = (versionId: string) =>
    createDraft.mutate(versionId, {
      onSuccess: ({ id }) => openVersion(id),
      onError: (error) => toasts.add({ title: errorText(t, error), variant: "negative" }),
    });

  return (
    <Stack gap="space-300">
      {onBack ? (
        <Flex>
          <Button variant="secondary" size="S" onPress={onBack}>
            {t("admin:list.backToList")}
          </Button>
        </Flex>
      ) : null}
      <Heading level={2}>{t("admin:templates.versionsHeading", { name: template.name })}</Heading>
      {draft ? (
        <InlineAlert variant="informative" heading={t("admin:templates.draftExists")}>
          <Flex>
            <Button variant="secondary" onPress={() => openVersion(draft.id)}>
              {t("admin:templates.openDraft")}
            </Button>
          </Flex>
        </InlineAlert>
      ) : null}
      <RowList aria-label={t("admin:templates.versionsLabel", { name: template.name })}>
        {versions.map((version) => (
          <RowListItem key={version.id}>
            <Flex justify="between" align="center" gap="space-200" wrap>
              <Stack gap="space-100">
                <Flex gap="space-100" align="center">
                  <Text as="span">
                    {t("admin:templates.versionLabel", { number: version.versionNumber })}
                  </Text>
                  <Badge size="S" variant={version.status === "draft" ? "notice" : "positive"}>
                    {version.status === "draft"
                      ? t("admin:templates.status.draft")
                      : t("admin:templates.status.published")}
                  </Badge>
                </Flex>
                <Text variant="caption" tone="secondary">
                  {version.publishedAt
                    ? t("admin:templates.publishedLine", {
                        date: formatDate(version.publishedAt, me.timezone),
                        name: version.publishedBy?.displayName ?? t("admin:templates.unknownUser"),
                      })
                    : t("admin:templates.notPublished")}
                </Text>
                <Text variant="caption" tone="secondary">
                  {t("admin:templates.inUse", { count: version.usageCount })}
                </Text>
              </Stack>
              <Flex gap="space-100" wrap>
                <Button variant="secondary" size="S" onPress={() => openVersion(version.id)}>
                  {version.status === "draft"
                    ? t("admin:templates.openDraft")
                    : t("admin:templates.view")}
                </Button>
                {version.status === "published" ? (
                  <Button
                    variant="secondary"
                    size="S"
                    isDisabled={draft !== undefined}
                    isPending={createDraft.isPending && createDraft.variables === version.id}
                    pendingLabel={t("app:saving")}
                    onPress={() => copy(version.id)}
                  >
                    {t("admin:templates.newDraft")}
                  </Button>
                ) : null}
              </Flex>
            </Flex>
          </RowListItem>
        ))}
      </RowList>
    </Stack>
  );
}
