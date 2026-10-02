import { formatDate } from "@moonx/i18n";
import {
  ActionMenu,
  AlertDialog,
  Button,
  Flex,
  Heading,
  HubPattern,
  IllustratedMessage,
  Link,
  Menu,
  MenuItem,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  StatusLight,
  Text,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { UserSearch } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QueryBoundary } from "../components/states";
import { isApiError } from "../lib/api-error";
import { errorText } from "../lib/error-text";
import { canEditIdeas, useWorkspaceRole } from "../lib/ideas";
import { useGoTo } from "../lib/navigate";
import { useOverlay } from "../lib/overlay";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import {
  type SelfAnalysisHome as Home,
  sectionPath,
  selfAnalysisHomeQuery,
  useSelfAnalysisActions,
} from "../lib/self-analysis";
import { useMe } from "../lib/session";
import { toasts } from "../lib/toast";
import { CurrencyDialog } from "./self-analysis/CurrencyDialog";
import { BlockHeading } from "./validation-home/BlockHeading";

function HomeSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-800" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

/**
 * Screen 10, the person's own self analysis (design-spec 6.11, pattern A). It is the same from
 * every workspace, since a self analysis belongs to its owner and not to a workspace. Sharing
 * (M6) opens only once it is done, and stopping to share is always possible.
 */
export function SelfAnalysisHome({ workspaceId }: { workspaceId: string }) {
  const query = useQuery(selfAnalysisHomeQuery);
  return (
    <QueryBoundary query={query} skeleton={<HomeSkeleton />}>
      {(home) => <HomeView workspaceId={workspaceId} home={home} />}
    </QueryBoundary>
  );
}

function HomeView({ workspaceId, home }: { workspaceId: string; home: Home }) {
  const { t } = useTranslation(["selfAnalysis", "app", "form"]);
  const me = useMe();
  const goTo = useGoTo();
  const role = useWorkspaceRole(workspaceId);
  const { openModal } = useOverlay();
  const { complete, reopen } = useSelfAnalysisActions();
  const [confirmEmpty, setConfirmEmpty] = useState<number | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  usePanelTarget(formatContainerTarget("self_analysis", home.id));

  const first = home.firstUnanswered ?? {
    sectionKey: home.sections[0]?.key ?? "",
    questionKey: "",
  };
  const open = () =>
    goTo(sectionPath(workspaceId, first.sectionKey, first.questionKey || undefined));
  const empty = home.total - home.answered;
  const failed = (error: unknown) => {
    // A 409 here means the questions emptied since the page loaded: ask with the server's count.
    if (isApiError(error) && error.code === "HAS_EMPTY_QUESTIONS") {
      setConfirmEmpty(Number(error.extra.emptyCount ?? empty));
      return;
    }
    toasts.add({ title: errorText(t, error), variant: "negative" });
  };
  const markDone = (confirmed: boolean) => complete.mutate(confirmed, { onError: failed });
  const isDone = home.status === "done";
  const sharedNames = home.shares.map((entry) => entry.workspace.name);

  const actions = (
    <Flex gap="space-100" align="center" wrap>
      <Button variant="accent" onPress={open}>
        {home.status === "not_started" ? t("selfAnalysis:empty.start") : t("selfAnalysis:continue")}
      </Button>
      <Menu trigger={<Button variant="secondary">{t("form:ai")}</Button>}>
        <MenuItem id="export" href={`/w/${workspaceId}/ai/export?source=self_analysis`}>
          {t("form:aiExport")}
        </MenuItem>
        <MenuItem id="import" href={`/w/${workspaceId}/ai/import?target=self_analysis`}>
          {t("form:aiImport")}
        </MenuItem>
      </Menu>
      {isDone ? (
        <Button
          variant="secondary"
          isPending={reopen.isPending}
          pendingLabel={t("app:saving")}
          onPress={() =>
            reopen.mutate(undefined, {
              onError: (error) => toasts.add({ title: errorText(t, error), variant: "negative" }),
            })
          }
        >
          {t("selfAnalysis:reopen")}
        </Button>
      ) : (
        <Button
          variant="secondary"
          isPending={complete.isPending}
          pendingLabel={t("app:saving")}
          onPress={() => (empty > 0 ? setConfirmEmpty(empty) : markDone(false))}
        >
          {t("selfAnalysis:markDone")}
        </Button>
      )}
      <Button variant="secondary" onPress={() => openModal("share")}>
        {t("selfAnalysis:share")}
      </Button>
      {canEditIdeas(role) ? (
        <Link href={`/w/${workspaceId}/team`}>{t("selfAnalysis:teamLink")}</Link>
      ) : null}
      <ActionMenu
        label={t("selfAnalysis:currencyMenu")}
        onAction={(key) => key === "currency" && setCurrencyOpen(true)}
      >
        <MenuItem id="currency">
          {t("selfAnalysis:changeCurrency", { currency: home.currency })}
        </MenuItem>
      </ActionMenu>
    </Flex>
  );

  return (
    <>
      <HubPattern
        hasTabBar
        header={
          <Stack gap="space-200">
            <Flex gap="space-200" align="baseline" justify="between" wrap>
              <Heading level={1}>{t("selfAnalysis:title")}</Heading>
              <Text tone="secondary" as="span">
                {t("selfAnalysis:summary", {
                  status: t(`selfAnalysis:status.${home.status}`),
                  answered: home.answered,
                  total: home.total,
                })}
              </Text>
            </Flex>
            {actions}
          </Stack>
        }
        summary={
          home.status === "not_started" ? (
            <IllustratedMessage
              icon={UserSearch}
              heading={t("selfAnalysis:empty.body", { count: home.total })}
              actions={
                <Button variant="accent" onPress={open}>
                  {t("selfAnalysis:empty.start")}
                </Button>
              }
            />
          ) : null
        }
        status={
          <Stack gap="space-100">
            <BlockHeading>{t("selfAnalysis:blocks.state")}</BlockHeading>
            <Text>
              {t("selfAnalysis:state.answered", { answered: home.answered, total: home.total })}
            </Text>
            <Text>
              {sharedNames.length > 0
                ? t("selfAnalysis:state.sharedWith", { names: sharedNames.join(", ") })
                : t("selfAnalysis:state.notShared")}
            </Text>
            <Text tone="secondary">
              {t("selfAnalysis:state.template", { version: home.template.versionNumber })}
            </Text>
            <Text tone="secondary">
              {t("selfAnalysis:state.currency", { currency: home.currency })}
            </Text>
            {home.completedAt ? (
              <Text tone="secondary">
                {t("selfAnalysis:state.completedOn", {
                  date: formatDate(home.completedAt, me.timezone),
                })}
              </Text>
            ) : null}
          </Stack>
        }
        entries={
          <Stack gap="space-100">
            <BlockHeading>{t("selfAnalysis:blocks.sections")}</BlockHeading>
            <RowList aria-label={t("selfAnalysis:sections.listLabel")}>
              {home.sections.map((section) => {
                const finished = section.total > 0 && section.answered === section.total;
                return (
                  <RowListItem key={section.key}>
                    <Flex gap="space-200" align="center" justify="between">
                      <Link href={sectionPath(workspaceId, section.key)}>{section.title}</Link>
                      <Flex gap="space-100" align="center">
                        <Text variant="caption" tone="secondary" as="span">
                          {t("selfAnalysis:sections.progress", {
                            answered: section.answered,
                            total: section.total,
                          })}
                        </Text>
                        {finished ? (
                          <StatusLight variant="done" size="S">
                            {t("selfAnalysis:sections.complete")}
                          </StatusLight>
                        ) : null}
                      </Flex>
                    </Flex>
                  </RowListItem>
                );
              })}
            </RowList>
          </Stack>
        }
      />
      <AlertDialog
        isOpen={confirmEmpty !== null}
        title={t("selfAnalysis:confirmDone.title")}
        primaryActionLabel={t("selfAnalysis:confirmDone.confirm")}
        cancelLabel={t("selfAnalysis:confirmDone.cancel")}
        onPrimaryAction={() => markDone(true)}
        onCancel={() => setConfirmEmpty(null)}
        onOpenChange={(isOpen) => !isOpen && setConfirmEmpty(null)}
      >
        {t("selfAnalysis:confirmDone.body", { count: confirmEmpty ?? 0 })}
      </AlertDialog>
      {currencyOpen ? (
        <CurrencyDialog currency={home.currency} onClose={() => setCurrencyOpen(false)} />
      ) : null}
    </>
  );
}
