import { formatDate, i18n } from "@moonx/i18n";
import {
  type PlanHome,
  type PlanSummary,
  shortTextSchema,
  type TargetRef,
} from "@moonx/schemas";
import {
  ActionButton,
  ActionMenu,
  Badge,
  Breadcrumb,
  Breadcrumbs,
  Button,
  CommentCount,
  Flex,
  Heading,
  type HubBlock as HubBlockSpec,
  HubPattern,
  InlineAlert,
  Link,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  MoonGlyph,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  Text,
  TextField,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import type { ScreenComments } from "../components/CommentsPanel";
import { ModalBoundary } from "../components/ErrorBoundary";
import { HubBlock } from "../components/HubBlock";
import { KeyMetrics } from "../components/ideaParts";
import {
  CreatePlanDialog,
  emptyGoNoGoDraft,
  GoNoGoDialog,
  RenamePlanDialog,
  SaveVersionDialog,
} from "../components/PlanDialogs";
import { ArchivedPlanAlert, usePlanActions } from "../components/planParts";
import { SaveFailureNote } from "../components/SaveFeedback";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import {
  type TemplateTarget,
  TemplateUpdateDialog,
  useIsTemplateUpdateOpen,
  useOpenTemplateUpdate,
  useTemplateBanner,
} from "../components/TemplateUpdate";
import { UserName } from "../components/UserName";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import {
  dashboardHref,
  useModal,
  usePanel,
  useWorkspace,
} from "../components/workspace";
import { aiExportHref, aiImportHref } from "../lib/ai";
import { api, inPath, unwrap } from "../lib/api";
import type { SaveTarget } from "../lib/autosave";
import { useAutosave, useSaveItem } from "../lib/autosave-react";
import { inputIssueMessage } from "../lib/input-issues";
import { questionLabel, rowLabel } from "../lib/item-labels";
import {
  decisionsHref,
  economicsHref,
  executionHref,
  ideaHref,
  ideasHref,
  pitchHref,
  planHref,
  planItemHref,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  archivedPlansQuery,
  commentsQuery,
  executionItemsQuery,
  ideaKey,
  planHomeQuery,
  planItemQuery,
  validationHomeQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/** `/w/$workspaceId/ideas/$ideaId/plans/$planId`'s own search (SDD 4章). */
export interface PlanHomeSearch {
  /** A saved version of the plan, shown read only. */
  version?: string;
}

/** What a plan's header keeps (packages/db history-values.ts `businessPlanContent`). */
const headerValueSchema = z.object({
  name: z.string(),
  businessName: z.string(),
  preparedBy: z.string(),
});

type HeaderField = "businessName" | "preparedBy";

/** The autosave key of a plan's header (P2 PATCH, design-spec 6.0.2's items). */
const headerKey = (planId: string) => `plan:${planId}`;

/**
 * The save of the plan's header (P2 PATCH): the answer is the plan home as it is now, and
 * someone else's save, loaded, takes the place of what was typed.
 */
function headerTarget(
  queryClient: QueryClient,
  home: PlanHome,
  noun: string,
): SaveTarget {
  const queryKey = planHomeQuery(home.ideaId, home.id).queryKey;
  return {
    key: headerKey(home.id),
    noun,
    send: async (fields, lockVersion, force) => {
      const updated = await unwrap(
        api()
          .api.v1.plans({ planId: inPath(home.id) })
          .patch({ ...fields, lockVersion, ...(force ? { force } : {}) }),
      );
      queryClient.setQueryData(queryKey, updated);
      return updated.lockVersion;
    },
    loadTheirs: (current) => {
      const value = headerValueSchema.safeParse(current.value);
      if (value.success) {
        queryClient.setQueryData(queryKey, (data) =>
          data === undefined
            ? undefined
            : {
                ...data,
                ...value.data,
                lockVersion: current.lockVersion,
                updatedAt: current.updatedAt,
                updatedBy: current.updatedBy,
              },
        );
      } else {
        // Not the header's shape: the screen reads it again instead.
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}

/**
 * Business Name and Prepared by, edited in place (design-spec 6.12「ヘッダ」) and saved as
 * they are typed (6.0.2). A value that breaks the short text's rule (6.0.8) says why and
 * is not sent. Read only offline.
 */
function HeaderFields({ home }: { home: PlanHome }) {
  const { t } = useTranslation(["plans", "errors"]);
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const isOnline = useIsOnline();
  const target = useMemo(
    () => headerTarget(queryClient, home, t("plans:home.headerNoun")),
    [queryClient, home, t],
  );
  const saving = useSaveItem(target.key);
  const [invalid, setInvalid] = useState<Partial<Record<HeaderField, string>>>(
    {},
  );
  useEffect(() => () => autosave.flush(target.key), [autosave, target.key]);
  const shown = (field: HeaderField): string => {
    const typed = invalid[field];
    if (typed !== undefined) return typed;
    if (saving !== undefined && Object.hasOwn(saving.unsaved, field)) {
      return String(saving.unsaved[field] ?? "");
    }
    return home[field];
  };
  const fieldProps = (field: HeaderField) => {
    const typed = invalid[field];
    const issue =
      typed === undefined
        ? undefined
        : shortTextSchema.safeParse(typed).error?.issues[0];
    return {
      value: shown(field),
      onChange: (value: string) => {
        if (shortTextSchema.safeParse(value).success) {
          setInvalid(({ [field]: _, ...rest }) => rest);
          autosave.change(target, home.lockVersion, { [field]: value });
        } else {
          setInvalid((fields) => ({ ...fields, [field]: value }));
          autosave.discard(target.key, [field]);
        }
      },
      onBlur: () => autosave.flush(target.key),
      isReadOnly: !isOnline,
      errorMessage: issue === undefined ? undefined : inputIssueMessage(issue),
      size: "S" as const,
    };
  };
  return (
    <Stack gap="space-100">
      <Flex gap="space-200" wrap alignItems="start">
        <TextField
          {...fieldProps("businessName")}
          label={t("plans:home.businessName")}
        />
        <TextField
          {...fieldProps("preparedBy")}
          label={t("plans:home.preparedBy")}
        />
      </Flex>
      <SaveFailureNote itemKey={target.key} />
    </Stack>
  );
}

/** Business Name and Prepared by as read (a Viewer, an archived plan, a version). */
function HeaderLine({ home }: { home: PlanHome }) {
  const { t } = useTranslation(["plans", "app"]);
  const value = (text: string) =>
    text.trim() === "" ? t("plans:home.empty") : text;
  return (
    <Text tone="secondary">
      {[
        t("plans:home.headerLine", {
          label: t("plans:home.businessName"),
          value: value(home.businessName),
        }),
        t("plans:home.headerLine", {
          label: t("plans:home.preparedBy"),
          value: value(home.preparedBy),
        }),
      ].join(t("app:separator"))}
    </Text>
  );
}

/**
 * The plan's name with ▼, the switch to the idea's other plans (design-spec 6.12
 * 「ヘッダ」): the plans in the order made, the archived ones under "Archived", and Add
 * plan (M5) where a plan can be added.
 */
function PlanSwitch({
  home,
  ideaName,
  canAddPlan,
  onAddPlan,
}: {
  home: PlanHome;
  ideaName: string;
  canAddPlan: boolean;
  onAddPlan: () => void;
}) {
  const { t } = useTranslation(["plans"]);
  const { workspace } = useWorkspace();
  const plans = useQuery(archivedPlansQuery(home.ideaId));
  // Until P1 answers, only this plan is known; a failed read offers to read again.
  const all = plans.data?.items ?? [home];
  const item = (plan: PlanSummary) => (
    <MenuItem
      key={plan.id}
      id={plan.id}
      href={planHref(workspace.id, home.ideaId, plan.id)}
    >
      {plan.name}
    </MenuItem>
  );
  const archived = all.filter((plan) => plan.archived);
  return (
    <Flex gap="space-50" alignItems="center">
      <Heading level={1} variant="heading-1-hub">
        {home.name}
      </Heading>
      <MenuTrigger>
        <ActionButton
          isQuiet
          aria-label={t("plans:home.switchPlan")}
          isDisabled={plans.isPending}
        >
          <ChevronDown />
        </ActionButton>
        <Menu
          aria-label={t("plans:home.plans", { idea: ideaName })}
          onAction={(key) => {
            if (key === "add-plan") onAddPlan();
            else if (key === "retry") void plans.refetch();
          }}
        >
          {all.filter((plan) => !plan.archived).map(item)}
          {archived.length > 0 && (
            <MenuSection title={t("plans:home.archivedGroup")}>
              {archived.map(item)}
            </MenuSection>
          )}
          {plans.isError && (
            <MenuItem id="retry">{t("plans:home.plansRetry")}</MenuItem>
          )}
          {canAddPlan && (
            <MenuItem id="add-plan">{t("plans:home.addPlan")}</MenuItem>
          )}
        </Menu>
      </MenuTrigger>
    </Flex>
  );
}

/**
 * The top of 20 (design-spec 6.12「ヘッダ」): what makes it read only (the archived idea
 * or plan, a saved version open), the plan's name with its switch, the version and the
 * date, Business Name and Prepared by, the latest decision when it is no longer Proceed,
 * and "Start with…" while the plan is still the draft's copy.
 */
function Header({
  home,
  ideaName,
  canEdit,
  canAddPlan,
  onAddPlan,
}: {
  home: PlanHome;
  ideaName: string;
  canEdit: boolean;
  canAddPlan: boolean;
  onAddPlan: () => void;
}) {
  const { t } = useTranslation(["plans", "common", "app"]);
  const { me, workspace } = useWorkspace();
  const viewing = home.viewingVersion;
  const date = formatDate(home.date, { timeZone: me.timezone });
  const version =
    viewing !== null
      ? t("plans:home.version", { name: viewing.name })
      : home.latestVersion === null
        ? t("plans:home.noVersion")
        : home.hasChangesSinceVersion
          ? t("plans:home.versionChanged", { name: home.latestVersion.name })
          : t("plans:home.version", { name: home.latestVersion.name });
  return (
    <>
      {home.ideaArchived ? (
        <ArchivedIdeaAlert ideaId={home.ideaId} />
      ) : (
        home.archived && <ArchivedPlanAlert home={home} />
      )}
      {viewing !== null && (
        <InlineAlert
          variant="informative"
          title={t("plans:home.viewing", { name: viewing.name })}
        >
          <Link href={planHref(workspace.id, home.ideaId, home.id)}>
            {t("plans:home.showLatest")}
          </Link>
        </InlineAlert>
      )}
      <PlanSwitch
        home={home}
        ideaName={ideaName}
        canAddPlan={canAddPlan}
        onAddPlan={onAddPlan}
      />
      <Text variant="caption" tone="secondary">
        {[
          version,
          viewing !== null
            ? t("plans:home.saved", { date })
            : t("plans:home.updated", { date }),
        ].join(t("app:separator"))}
      </Text>
      {canEdit ? <HeaderFields home={home} /> : <HeaderLine home={home} />}
      {home.latestDecision !== "proceed" && (
        <InlineAlert variant="notice">
          {t("plans:home.latestDecision", {
            value: t(`common:decision.${home.latestDecision ?? "undecided"}`),
          })}
        </InlineAlert>
      )}
      {home.draftOnly && viewing === null && (
        <Text elementType="p">{t("plans:home.startWith")}</Text>
      )}
    </>
  );
}

/**
 * The way to 23 (design-spec 6.12): for every role, archived too (6.8), and to the deck
 * of the version open.
 */
function PitchDeckButton({ home }: { home: PlanHome }) {
  const { t } = useTranslation(["plans"]);
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      onPress={() =>
        void navigate({
          href: pitchHref(workspace.id, home.ideaId, home.id, {
            version: home.viewingVersion?.id,
          }),
        })
      }
    >
      {t("plans:home.pitchDeck")}
    </Button>
  );
}

/** What M8 moves on 20: the plan (SDD 4章 `about=business_plan:<id>`). */
const planTarget = (home: PlanHome): TemplateTarget => ({
  kind: "business_plan",
  id: home.id,
});

/**
 * The tools beside the plan's name for the Owners and Members while it can be changed
 * (design-spec 6.12): Save version (M3), Pitch Deck (23), and ⋯ with Rename plan,
 * Export for AI and Import from AI (24, 25), Archive plan and, while a newer template is
 * published, Update template (M8).
 */
function Tools({
  home,
  onSaveVersion,
  onRename,
}: {
  home: PlanHome;
  onSaveVersion: () => void;
  onRename: () => void;
}) {
  const { t } = useTranslation(["plans", "ai", "app"]);
  const { workspace } = useWorkspace();
  const actions = usePlanActions();
  const openTemplateUpdate = useOpenTemplateUpdate();
  const here = planHref(workspace.id, home.ideaId, home.id);
  const ai = { kind: "business_plan" as const, id: home.id, returnTo: here };
  return (
    <>
      <Button variant="secondary" onPress={onSaveVersion}>
        {t("plans:home.saveVersion")}
      </Button>
      <PitchDeckButton home={home} />
      <ActionMenu
        aria-label={t("plans:home.more", { name: home.name })}
        onAction={(key) => {
          if (key === "rename") onRename();
          else if (key === "archive") actions.archive(home);
          else if (key === "update-template")
            openTemplateUpdate(planTarget(home));
        }}
      >
        <MenuItem id="rename">{t("plans:home.rename")}</MenuItem>
        <MenuItem id="export" href={aiExportHref(workspace.id, ai)}>
          {t("ai:menu.export")}
        </MenuItem>
        <MenuItem id="import" href={aiImportHref(workspace.id, ai)}>
          {t("ai:menu.import")}
        </MenuItem>
        <MenuItem id="archive">{t("plans:home.archive")}</MenuItem>
        {home.template.newerVersion !== null && (
          <MenuItem id="update-template">
            {t("app:templateUpdate.action")}
          </MenuItem>
        )}
      </ActionMenu>
    </>
  );
}

/**
 * The validation's key numbers (design-spec 6.12, 6.4「主要指標」): read here and fixed
 * in the validation, whose 18 "Edit in validation" opens (several numbers go to 18). A
 * version open shows the numbers it saved.
 */
function KeyNumbersBlock({
  home,
  canEditValidation,
}: {
  home: PlanHome;
  canEditValidation: boolean;
}) {
  const { t } = useTranslation(["plans"]);
  const { workspace } = useWorkspace();
  return (
    <HubBlock
      title={t("plans:home.keyNumbers.title")}
      aside={
        home.viewingVersion === null
          ? t("plans:home.keyNumbers.fromValidation")
          : t("plans:home.keyNumbers.fromVersion")
      }
    >
      <KeyMetrics
        metrics={home.keyMetrics}
        currency={workspace.currency}
        variant="pair"
        aria-label={t("plans:home.keyNumbers.title")}
      />
      <Flex>
        <Link href={economicsHref(workspace.id, home.ideaId)}>
          {canEditValidation
            ? t("plans:home.keyNumbers.edit")
            : t("plans:home.keyNumbers.open")}
        </Link>
      </Flex>
    </HubBlock>
  );
}

/** The latest Go / No-Go and the way to all of them in 7 (design-spec 6.12・6.15). */
function GoNoGoBlock({ home }: { home: PlanHome }) {
  const { t } = useTranslation(["plans", "common", "app"]);
  const { me, workspace } = useWorkspace();
  const latest = home.latestGoNoGo;
  return (
    <HubBlock title={t("plans:home.goNoGo.title")}>
      {latest === null ? (
        <Text tone="secondary" elementType="p">
          {t("plans:home.goNoGo.none")}
        </Text>
      ) : (
        <Flex gap="space-200" alignItems="center" wrap>
          <Badge>{t(`common:goNoGo.${latest.value}`)}</Badge>
          <Text variant="caption" tone="secondary">
            {formatDate(latest.recordedAt, { timeZone: me.timezone })}
            {t("app:separator")}
            <UserName user={latest.recordedBy} />
          </Text>
        </Flex>
      )}
      {latest !== null && (
        <Flex>
          <Link
            href={decisionsHref(workspace.id, {
              kind: "go_no_go",
              idea: home.ideaId,
            })}
          >
            {t("plans:home.goNoGo.seeAll")}
          </Link>
        </Flex>
      )}
    </HubBlock>
  );
}

/**
 * The saved versions, newest first (design-spec 6.12): each opens 20 on it, read only;
 * the one open says so.
 */
function VersionsBlock({ home }: { home: PlanHome }) {
  const { t } = useTranslation(["plans", "app"]);
  const { me, workspace } = useWorkspace();
  return (
    <HubBlock title={t("plans:home.versions.title")}>
      {home.versions.length === 0 ? (
        <Text tone="secondary" elementType="p">
          {t("plans:home.versions.none")}
        </Text>
      ) : (
        <RowList aria-label={t("plans:home.versions.title")}>
          {home.versions.map((version) => {
            const isOpen = home.viewingVersion?.id === version.id;
            const meta = t("plans:home.versions.meta", {
              date: formatDate(version.savedAt, { timeZone: me.timezone }),
              name: version.savedBy.displayName,
            });
            return (
              <RowListItem
                key={version.id}
                href={
                  isOpen
                    ? undefined
                    : planHref(workspace.id, home.ideaId, home.id, {
                        version: version.id,
                      })
                }
                description={
                  isOpen
                    ? [t("plans:home.versions.viewing"), meta].join(
                        t("app:separator"),
                      )
                    : meta
                }
              >
                {version.name}
              </RowListItem>
            );
          })}
        </RowList>
      )}
    </HubBlock>
  );
}

/**
 * How many execution items are due within 7 days and overdue (design-spec 6.12, SDD 5.9
 * `execution`), counted from the plan as it is now, and the way to 22.
 */
function ExecutionBlock({ home }: { home: PlanHome }) {
  const { t } = useTranslation(["plans"]);
  const { workspace } = useWorkspace();
  const { dueSoon, overdue } = home.execution;
  return (
    <HubBlock title={t("plans:home.execution.title")}>
      <Stack gap="space-50">
        {dueSoon === 0 && overdue === 0 ? (
          <Text tone="secondary">{t("plans:home.execution.nothingDue")}</Text>
        ) : (
          <>
            {overdue > 0 && (
              <Text tone="notice">
                {t("plans:home.execution.overdue", { count: overdue })}
              </Text>
            )}
            {dueSoon > 0 && (
              <Text>
                {t("plans:home.execution.dueSoon", { count: dueSoon })}
              </Text>
            )}
          </>
        )}
      </Stack>
      <Flex>
        <Link href={executionHref(workspace.id, home.ideaId, home.id)}>
          {t("plans:home.execution.open")}
        </Link>
      </Flex>
    </HubBlock>
  );
}

type Part = PlanHome["parts"][number];

/**
 * One part's items (design-spec 6.12「項目の状態」): how many are complete, and each item
 * with a moon as full as its sub-items are filled, its [V] and [S] marks, its count and
 * its comments. An item opens 21, on the version open here if one is.
 */
function PartBlock({ home, part }: { home: PlanHome; part: Part }) {
  const { t } = useTranslation(["plans"]);
  const { workspace } = useWorkspace();
  const title = t(`plans:home.part.${part.part}`);
  return (
    <HubBlock
      title={title}
      aside={t("plans:home.part.complete", {
        complete: part.completeItems,
        total: part.totalItems,
      })}
      isAsideNumeric
    >
      <RowList aria-label={title}>
        {part.items.map((item) => (
          <RowListItem
            key={item.itemNo}
            href={planItemHref(
              workspace.id,
              home.ideaId,
              home.id,
              item.itemNo,
              {
                version: home.viewingVersion?.id,
              },
            )}
            start={
              <MoonGlyph
                value={item.total === 0 ? 1 : item.filled / item.total}
              />
            }
            badge={
              item.marks.length === 0 ? undefined : (
                <Flex gap="space-50">
                  {item.marks.map((mark) => (
                    <Badge
                      key={mark}
                      aria-label={t(`plans:home.mark.${mark}Name`)}
                    >
                      {t(`plans:home.mark.${mark}`)}
                    </Badge>
                  ))}
                </Flex>
              )
            }
            marks={
              item.commentCount > 0 ? (
                <CommentCount count={item.commentCount} />
              ) : undefined
            }
            end={t("plans:home.filled", {
              filled: item.filled,
              total: item.total,
            })}
            isEndNumeric
          >
            {t("plans:home.item", { no: item.itemNo, title: item.title })}
          </RowListItem>
        ))}
      </RowList>
    </HubBlock>
  );
}

function PlanHub({
  home,
  ideaName,
  modal,
  about,
}: {
  home: PlanHome;
  ideaName: string;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["plans"]);
  const { role } = useWorkspace();
  const modals = useModal();
  const [isRenaming, setRenaming] = useState(false);
  // M4's choice and reason, kept while M3 opens from it (6.12 M4); emptied when Record
  // Go / No-Go opens M4 anew.
  const [goNoGoDraft, setGoNoGoDraft] = useState(emptyGoNoGoDraft);
  const isMember = role !== "viewer";
  // Read only for a Viewer, an archived idea or plan, and a saved version (6.12).
  const canEdit =
    isMember &&
    !home.ideaArchived &&
    !home.archived &&
    home.viewingVersion === null;
  // M5 only after Proceed (6.12「M5」); an archived plan's 20 is not where to add one.
  const canAddPlan =
    isMember &&
    !home.ideaArchived &&
    !home.archived &&
    home.latestDecision === "proceed";
  const isUpdatingTemplate = useIsTemplateUpdateOpen(
    modal,
    about,
    planTarget(home),
    canEdit,
  );
  const [partA, partB] = [
    home.parts.find((part) => part.part === "a"),
    home.parts.find((part) => part.part === "b"),
  ];
  // The phone's order (6.12): the key numbers, the items, Go / No-Go, Versions, Execution.
  const blocks: HubBlockSpec[] = [
    {
      id: "numbers",
      column: "main",
      content: (
        <KeyNumbersBlock
          home={home}
          canEditValidation={isMember && !home.ideaArchived}
        />
      ),
    },
    ...[partA, partB].flatMap((part) =>
      part === undefined
        ? []
        : [
            {
              id: `part-${part.part}`,
              column: "aside" as const,
              content: <PartBlock home={home} part={part} />,
            },
          ],
    ),
    { id: "go-no-go", column: "main", content: <GoNoGoBlock home={home} /> },
    { id: "versions", column: "main", content: <VersionsBlock home={home} /> },
    {
      id: "execution",
      column: "main",
      content: <ExecutionBlock home={home} />,
    },
  ];
  return (
    <>
      <HubPattern
        header={
          <Header
            home={home}
            ideaName={ideaName}
            canEdit={canEdit}
            canAddPlan={canAddPlan}
            onAddPlan={() => modals.open("create-plan")}
          />
        }
        actions={
          canEdit ? (
            <Tools
              home={home}
              onSaveVersion={() => modals.open("save-version")}
              onRename={() => setRenaming(true)}
            />
          ) : (
            <PitchDeckButton home={home} />
          )
        }
        primaryAction={
          canEdit ? (
            <Button
              variant="primary"
              onPress={() => {
                // A new M4 starts empty: only the way back from M3 keeps what it had.
                setGoNoGoDraft(emptyGoNoGoDraft);
                modals.open("go-no-go");
              }}
            >
              {t("plans:home.recordGoNoGo")}
            </Button>
          ) : undefined
        }
        blocks={blocks}
      />
      {modal === "save-version" && canEdit && (
        <ModalBoundary key={modal} onClose={modals.close}>
          <SaveVersionDialog home={home} onClose={modals.close} />
        </ModalBoundary>
      )}
      {modal === "go-no-go" && canEdit && (
        <ModalBoundary key={modal} onClose={modals.close}>
          <GoNoGoDialog
            home={home}
            draft={goNoGoDraft}
            onDraftChange={setGoNoGoDraft}
            // The draft is emptied when M4 is opened anew, not here: emptied before M4
            // has gone, it would show cleared for a moment.
            onClose={modals.close}
            onSaveVersion={() => modals.open("save-version")}
          />
        </ModalBoundary>
      )}
      {modal === "create-plan" && canAddPlan && (
        <ModalBoundary key={modal} onClose={modals.close}>
          <CreatePlanDialog ideaId={home.ideaId} onClose={modals.close} />
        </ModalBoundary>
      )}
      {isRenaming && canEdit && (
        <ModalBoundary onClose={() => setRenaming(false)}>
          <RenamePlanDialog home={home} onClose={() => setRenaming(false)} />
        </ModalBoundary>
      )}
      {isUpdatingTemplate && (
        <ModalBoundary key={modal} onClose={modals.close}>
          <TemplateUpdateDialog
            target={planTarget(home)}
            dataKeys={[ideaKey(home.ideaId)]}
            onClose={modals.close}
          />
        </ModalBoundary>
      )}
    </>
  );
}

/**
 * 20's shape while it loads (design-spec 6.0.6): the name, the key numbers and the items.
 * Drawn inside a `Skeleton`, its words are bars.
 */
export function PlanHomeSkeleton() {
  const { t } = useTranslation(["plans"]);
  const rows = (label: string) => (
    <RowList aria-label={label}>
      {[0, 1, 2, 3].map((row) => (
        <RowListItem
          key={row}
          end={t("plans:home.filled", { filled: 0, total: 0 })}
        >
          {label}
        </RowListItem>
      ))}
    </RowList>
  );
  return (
    <HubPattern
      header={
        <Heading level={1} variant="heading-1-hub">
          {t("plans:home.keyNumbers.title")}
        </Heading>
      }
      blocks={[
        {
          id: "numbers",
          column: "main",
          content: (
            <HubBlock title={t("plans:home.keyNumbers.title")}>
              {rows(t("plans:home.keyNumbers.title"))}
            </HubBlock>
          ),
        },
        {
          id: "part-a",
          column: "aside",
          content: (
            <HubBlock title={t("plans:home.part.a")}>
              {rows(t("plans:home.part.a"))}
            </HubBlock>
          ),
        },
      ]}
    />
  );
}

function PlanHomeBody({
  ideaId,
  planId,
  versionId,
  modal,
  about,
}: {
  ideaId: string;
  planId: string;
  versionId: string | undefined;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { me, workspace } = useWorkspace();
  const home = useQuery(planHomeQuery(ideaId, planId, versionId));
  const idea = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(home.isPending || idea.isPending);
  const failure = home.error ?? idea.error;
  if (home.data !== undefined && home.data.workspaceId !== workspace.id) {
    // Another workspace's plan under this one's URL (SDD 4章).
    return <NoAccessState dashboardHref={dashboardHref(me)} />;
  }
  if (home.data !== undefined && home.data.ideaId !== ideaId) {
    // A plan of another idea of this workspace: no plan by that path.
    return <NotFoundState dashboardHref={dashboardHref(me)} />;
  }
  if (home.data !== undefined && idea.data !== undefined) {
    return (
      <PlanHub
        // Another plan is another hub: its typed header and M4's choice stay its own.
        key={home.data.id}
        home={home.data}
        ideaName={idea.data.idea.name}
        modal={modal}
        about={about}
      />
    );
  }
  if (failure !== null) {
    return (
      <FailureState
        error={failure}
        onRetry={() => {
          void home.refetch();
          void idea.refetch();
        }}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  if (isSlow) {
    return (
      <SlowLoadingState
        onRetry={() => {
          void home.refetch();
          void idea.refetch();
        }}
      />
    );
  }
  return (
    <Skeleton isLoading>
      <PlanHomeSkeleton />
    </Skeleton>
  );
}

/**
 * The names of the items the plan's threads are on, for the header's list of comments
 * (design-spec 6.0.4: "{section} {question}", "Execution · {its first column}", "Pitch
 * Deck", as SDD 5.11 names them): read once the list is open, from the items whose
 * answers have threads and from the execution items.
 */
function usePlanThreadLabels(
  ideaId: string,
  planId: string,
  isListOpen: boolean,
) {
  const { workspace } = useWorkspace();
  const threads = useQuery({
    ...commentsQuery(workspace.id, {
      kind: "screen",
      screen: {
        containerType: "business_plan",
        containerId: planId,
        sectionKeys: [],
      },
    }),
    enabled: isListOpen,
  });
  const targets = (threads.data?.threads ?? []).map(
    (thread) => thread.root.target,
  );
  const itemNos = [
    ...new Set(
      targets.flatMap((target) =>
        target.type === "plan_answer"
          ? [Number(target.key?.split(".")[1])]
          : [],
      ),
    ),
  ].filter(Number.isInteger);
  const items = useQueries({
    queries: itemNos.map((itemNo) => planItemQuery(ideaId, planId, itemNo)),
  });
  const execution = useQuery({
    ...executionItemsQuery(ideaId, planId),
    enabled: targets.some((target) => target.type === "execution_item"),
  });
  const prompts = new Map(
    items.flatMap((item) =>
      (item.data?.prompts ?? []).map(
        (prompt) => [prompt.key, prompt.title] as const,
      ),
    ),
  );
  const rows = new Map(
    (execution.data?.items ?? []).map((row) => [row.id, row.title] as const),
  );
  const reads = [...items, ...(execution.isEnabled ? [execution] : [])];
  const state = {
    isPending: reads.some((read) => read.isPending),
    error: reads.find((read) => read.isError)?.error ?? null,
    // From a failure and from a wait that has gone on (6.0.6): the reads not in yet.
    retry: () => {
      for (const read of reads) {
        if (read.isError || read.isPending) void read.refetch();
      }
    },
  };
  const labelOf = (target: TargetRef): string | undefined => {
    switch (target.type) {
      case "plan_answer": {
        const title = prompts.get(target.key ?? "");
        return title === undefined || target.key == null
          ? undefined
          : questionLabel(target.key, title);
      }
      case "execution_item": {
        const title = rows.get(target.id);
        return title === undefined
          ? undefined
          : rowLabel("execution_item", title);
      }
      case "pitch_slide":
        return i18n.t("common:itemLabel.list.pitch_slide");
      default:
        return undefined;
    }
  };
  return { labelOf, state };
}

/**
 * 20 Plan home (design-spec 6.12): pattern A. The plan's name with its switch, the
 * version and the header; the key numbers, Go / No-Go, Versions and Execution in the main
 * column, Part A and Part B beside them; on a phone the numbers, the parts, Go / No-Go,
 * Versions, Execution. Record Go / No-Go is the main action. A saved version opens read
 * only. PNL-1 lists every thread of the plan with the idea's, PNL-2 the plan's changes.
 */
export function PlanHomeScreen({
  ideaId,
  planId,
  search,
  modal,
  about,
}: {
  ideaId: string;
  planId: string;
  search: PlanHomeSearch;
  modal: string | undefined;
  /** What the modal is about: M8's `business_plan:<id>`. */
  about: string | undefined;
}) {
  const { t } = useTranslation(["ideas"]);
  const { workspace, role } = useWorkspace();
  const panel = usePanel();
  const { data } = useQuery(planHomeQuery(ideaId, planId, search.version));
  const { data: ideaData } = useQuery(validationHomeQuery(ideaId));
  const home =
    data?.workspaceId === workspace.id && data.ideaId === ideaId
      ? data
      : undefined;
  const idea =
    ideaData?.idea.workspaceId === workspace.id ? ideaData.idea : undefined;
  // Not on a saved version, which is read only (6.12): the plan is migrated as it is now.
  const templateBanner = useTemplateBanner(
    home?.template,
    home === undefined ? undefined : planTarget(home),
    home !== undefined &&
      role !== "viewer" &&
      !home.ideaArchived &&
      !home.archived &&
      home.viewingVersion === null,
  );
  useDocumentTitle(
    ...(home === undefined || idea === undefined
      ? []
      : [home.name, idea.name, workspace.name]),
  );
  const isListOpen =
    panel.open?.name === "comments" && panel.open.target.kind === "screen";
  const threadLabels = usePlanThreadLabels(ideaId, planId, isListOpen);
  // 20's comments and history are the whole plan's (SDD 6.3「画面と節の対応」), with the
  // idea's comments in the list; it shows no item of its own to open a thread on.
  const comments: ScreenComments | undefined =
    home === undefined || idea === undefined
      ? undefined
      : {
          screen: {
            containerType: "business_plan",
            containerId: planId,
            sectionKeys: [],
          },
          // Both reads say whether the idea is archived; either may come back first.
          idea: {
            id: ideaId,
            name: idea.name,
            archived: idea.archived || home.ideaArchived,
          },
          plan: { id: planId, archived: home.archived },
          // The idea's data holds the plan's too, and 13's and the switch's plan names,
          // which a reverted rename changes.
          dataKey: ideaKey(ideaId),
          shows: () => false,
          labelOf: (target) =>
            target.type === "idea" ? idea.name : threadLabels.labelOf(target),
          labelsState: threadLabels.state,
        };
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope={headerKey(planId)}
      comments={comments}
      history={comments}
      templateBanner={templateBanner}
      back={
        idea === undefined
          ? { label: t("ideas:title"), href: ideasHref(workspace.id) }
          : { label: idea.name, href: ideaHref(workspace.id, ideaId) }
      }
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {idea !== undefined && (
            <Breadcrumb href={ideaHref(workspace.id, ideaId)}>
              {idea.name}
            </Breadcrumb>
          )}
          {home !== undefined && <Breadcrumb>{home.name}</Breadcrumb>}
        </Breadcrumbs>
      }
    >
      <PlanHomeBody
        ideaId={ideaId}
        planId={planId}
        versionId={search.version}
        modal={modal}
        about={about}
      />
    </WorkspaceFrame>
  );
}
