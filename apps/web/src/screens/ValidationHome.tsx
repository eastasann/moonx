import { formatDate, i18n } from "@moonx/i18n";
import {
  type CheckResult,
  decisionValueSchema,
  type FauBreakdown,
  type NextStep,
  type PlanSummary,
  type ValidationHome,
} from "@moonx/schemas";
import {
  ActionMenu,
  Badge,
  Breadcrumb,
  Breadcrumbs,
  Button,
  DescriptionList,
  DescriptionListItem,
  Divider,
  Flex,
  Heading,
  type HubBlock as HubBlockSpec,
  HubPattern,
  InlineAlert,
  Link,
  MenuItem,
  Meter,
  MoonGlyph,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalBoundary } from "../components/ErrorBoundary";
import { HubBlock } from "../components/HubBlock";
import { EditSummaryDialog } from "../components/IdeaDialogs";
import { useIdeaActions } from "../components/ideaActions";
import {
  CheckRows,
  checkReason,
  DecisionBadge,
  KeyMetrics,
} from "../components/ideaParts";
import {
  FailureState,
  NoAccessState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { UserName } from "../components/UserName";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useWorkspace } from "../components/workspace";
import { hrefOf, ideaHref, ideasHref } from "../lib/links";
import { archivedPlansQuery, validationHomeQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

type Section = ValidationHome["sections"][number];

const nextStepKey = "validation:home.nextSteps";

/** A section's numbered name (V1 sections[].title), by its key. */
const sectionName = (sections: readonly Section[], key: string | null) =>
  sections.find((section) => section.key === key)?.title ?? key ?? "";

/** What a Next step says (design-spec 6.1「Next steps の決め方」). */
function nextStepLabel(step: NextStep, sections: readonly Section[]): string {
  const t = i18n.t.bind(i18n);
  const count = step.count ?? 0;
  switch (step.kind) {
    case "add_evidence":
    case "classify":
    case "check_unknowns":
      return t(`${nextStepKey}.${step.kind}`, { count });
    case "start_customer_problem":
    case "start_section":
      return t(`${nextStepKey}.${step.kind}`, {
        section: sectionName(sections, step.sectionKey),
      });
    case "ready_to_decide":
      return t(`${nextStepKey}.ready_to_decide`);
    case "check":
      switch (step.checkKey) {
        case "competitors":
          return t(`${nextStepKey}.check.competitors`, { count });
        case "costs":
          return step.count === null
            ? t(`${nextStepKey}.check.costs`)
            : t(`${nextStepKey}.check.costsEmpty`, { count });
        case null:
          throw new Error("A check's Next step names its check (SDD 5.2)");
        default:
          return t(`${nextStepKey}.check.${step.checkKey}`);
      }
  }
}

/**
 * The line under the first Next step: why it is first (design-spec 6.1). A check's is its
 * reason in the Checks block; a break-even with price and monthly costs but no positive
 * margin is told to review them.
 */
function nextStepReason(
  step: NextStep,
  sections: readonly Section[],
  checks: readonly CheckResult[],
): string | undefined {
  const t = i18n.t.bind(i18n);
  const count = step.count ?? 0;
  switch (step.kind) {
    case "add_evidence":
      return t(`${nextStepKey}.add_evidenceWhy`, {
        count,
        section: sectionName(sections, step.sectionKey),
      });
    case "classify":
    case "check_unknowns":
      return t(`${nextStepKey}.${step.kind}Why`, { count });
    case "start_customer_problem":
    case "ready_to_decide":
      return t(`${nextStepKey}.${step.kind}Why`);
    case "start_section":
      return t(`${nextStepKey}.start_sectionWhy`, {
        section: sectionName(sections, step.sectionKey),
      });
    case "check": {
      const check = checks.find(({ key }) => key === step.checkKey);
      return check === undefined
        ? undefined
        : (checkReason(check) ?? undefined);
    }
  }
}

/** A break-even blocked only by its margin reads "Review price or variable costs" (6.1). */
function labelOf(
  step: NextStep,
  sections: readonly Section[],
  checks: readonly CheckResult[],
): string {
  if (step.kind === "check" && step.checkKey === "break_even") {
    const check = checks.find(({ key }) => key === "break_even");
    if (check !== undefined && (check.detail?.missing ?? []).length === 0) {
      return i18n.t(`${nextStepKey}.check.break_evenMargin`);
    }
  }
  return nextStepLabel(step, sections);
}

function NextSteps({ home }: { home: ValidationHome }) {
  const { t } = useTranslation(["validation"]);
  return (
    <HubBlock title={t("validation:home.nextSteps.title")}>
      <RowList ordered aria-label={t("validation:home.nextSteps.title")}>
        {home.nextSteps.map((step, index) => (
          <RowListItem
            // A kind shows once, but a check per check key.
            key={`${step.kind}:${step.checkKey ?? step.sectionKey ?? ""}`}
            href={step.link === null ? undefined : hrefOf(step.link)}
            isEmphasized={index === 0}
            description={
              index === 0
                ? nextStepReason(step, home.sections, home.checks)
                : undefined
            }
          >
            {labelOf(step, home.sections, home.checks)}
          </RowListItem>
        ))}
      </RowList>
    </HubBlock>
  );
}

const total = (fau: FauBreakdown) =>
  fau.fact + fau.assumption.total + fau.unknown + fau.unclassified + fau.empty;

/** The F/A/U of every item, in one band and its legend (design-spec 6.1, d1-moon.html). */
function FauBlock({ fau }: { fau: FauBreakdown }) {
  const { t } = useTranslation(["validation", "common"]);
  return (
    <HubBlock
      title={t("validation:home.fau.title")}
      aside={t("validation:home.fau.items", { count: total(fau) })}
      isAsideNumeric
    >
      <Meter
        aria-label={t("validation:home.fau.meter")}
        // Only what the items hold: a new idea shows "Empty" alone (6.1「作ったばかり」).
        segments={[
          {
            state: "fact" as const,
            label: t("common:fauState.fact"),
            count: fau.fact,
          },
          {
            state: "assumption" as const,
            label: t("common:fauState.assumption"),
            count: fau.assumption.total,
            detail: t("validation:home.fau.confidences", fau.assumption),
          },
          {
            state: "unknown" as const,
            label: t("common:fauState.unknown"),
            count: fau.unknown,
          },
          {
            state: "unclassified" as const,
            label: t("common:fauState.unclassified"),
            count: fau.unclassified,
          },
          {
            state: "empty" as const,
            label: t("common:fauState.empty"),
            count: fau.empty,
          },
        ].filter(({ count }) => count > 0)}
      />
    </HubBlock>
  );
}

/**
 * Customer, Problem, Solution and Market type (design-spec 6.1): "Empty" where nothing is
 * written. Solution is the idea's own, written in Edit summary; the others open 11 once
 * it is built.
 */
function SummaryBlock({
  home,
  onEdit,
}: {
  home: ValidationHome;
  onEdit: (() => void) | undefined;
}) {
  const { t } = useTranslation(["validation"]);
  const empty = (
    <Text tone="secondary">{t("validation:home.summary.empty")}</Text>
  );
  const value = (text: string | null) => text ?? empty;
  return (
    <HubBlock title={t("validation:home.summary.title")}>
      <DescriptionList>
        <DescriptionListItem label={t("validation:home.summary.customer")}>
          {value(home.summary.customer)}
        </DescriptionListItem>
        <DescriptionListItem label={t("validation:home.summary.problem")}>
          {value(home.summary.problem)}
        </DescriptionListItem>
        <DescriptionListItem label={t("validation:home.summary.solution")}>
          {home.summary.solution ??
            (onEdit === undefined ? (
              empty
            ) : (
              <Stack gap="space-50">
                {empty}
                <Flex>
                  <Link onPress={onEdit}>
                    {t("validation:home.editSummary")}
                  </Link>
                </Flex>
              </Stack>
            ))}
        </DescriptionListItem>
        <DescriptionListItem label={t("validation:home.summary.marketType")}>
          {value(home.summary.marketType)}
        </DescriptionListItem>
      </DescriptionList>
    </HubBlock>
  );
}

/** What a section's row ends with (design-spec 6.1「セクションの進み具合の数え方」). */
function sectionEnd(section: Section, checks: readonly CheckResult[]): string {
  const t = i18n.t.bind(i18n);
  const counts = {
    answered: section.answered ?? 0,
    total: section.total ?? 0,
  };
  switch (section.key) {
    case "03":
      return t("validation:home.sections.entries", {
        count: section.count ?? 0,
      });
    case "04": {
      const { min = 0, max = 0 } =
        checks.find(({ key }) => key === "competitors")?.params ?? {};
      return t("validation:home.sections.competitors", {
        count: section.count ?? 0,
        range:
          min < max
            ? t("validation:home.sections.range", { min, max })
            : t("validation:home.sections.rangeAtLeast", { min }),
      });
    }
    case "05":
      return t("validation:home.sections.rows", counts);
    case "06-08":
      return t("validation:home.sections.inputs", counts);
    case "09":
      return t("validation:home.sections.assumptionsRisks", {
        assumptions: section.count ?? 0,
        risks: section.countB ?? 0,
      });
    default:
      return t("validation:home.sections.answered", counts);
  }
}

/**
 * The ten sections with how far each is (design-spec 6.1): a moon filled as far for the
 * ones with a whole. A row opens its screen once that is built.
 */
function SectionsBlock({ home }: { home: ValidationHome }) {
  const { t } = useTranslation(["validation"]);
  return (
    <HubBlock title={t("validation:home.sections.title")}>
      <RowList aria-label={t("validation:home.sections.title")}>
        {home.sections.map((section) => (
          <RowListItem
            key={section.key}
            start={
              section.total === null ? undefined : (
                <MoonGlyph
                  value={
                    section.total === 0
                      ? 0
                      : (section.answered ?? 0) / section.total
                  }
                />
              )
            }
            end={sectionEnd(section, home.checks)}
            isEndNumeric
          >
            {section.title}
          </RowListItem>
        ))}
      </RowList>
    </HubBlock>
  );
}

/** The idea's decisions, newest first (design-spec 6.1, d1-moon.html .decision). */
function DecisionsBlock({ home }: { home: ValidationHome }) {
  const { t } = useTranslation(["validation", "common", "app"]);
  const { me } = useWorkspace();
  return (
    <HubBlock title={t("validation:home.decisions.title")}>
      {home.decisions.length === 0 ? (
        <Text tone="secondary" elementType="p">
          {t("validation:home.decisions.empty")}
        </Text>
      ) : (
        <Stack gap="space-100">
          {home.decisions.map((decision) => (
            <Stack key={decision.id} gap="space-100">
              <Divider size="S" />
              <Text variant="caption" tone="secondary">
                <Text variant="caption" tone="primary">
                  <strong>
                    {t(
                      `common:decision.${decisionValueSchema.parse(decision.value)}`,
                    )}
                  </strong>
                </Text>
                {t("app:separator")}
                {formatDate(decision.recordedAt, { timeZone: me.timezone })}
                {t("app:separator")}
                <UserName user={decision.recordedBy} />
              </Text>
              {decision.reasonExcerpt !== null && (
                <Text>
                  {t("validation:home.decisions.reason", {
                    reason: decision.reasonExcerpt,
                  })}
                </Text>
              )}
            </Stack>
          ))}
          <Divider size="S" />
        </Stack>
      )}
    </HubBlock>
  );
}

function PlanRow({ plan }: { plan: PlanSummary }) {
  const { t } = useTranslation(["validation", "common"]);
  return (
    <RowListItem
      description={
        plan.latestVersion?.name ?? t("validation:home.plans.noVersion")
      }
      end={
        plan.latestGoNoGo === null
          ? undefined
          : t(`common:goNoGo.${plan.latestGoNoGo.value}`)
      }
      badge={
        plan.archived ? (
          <Badge>{t("validation:home.plans.archivedBadge")}</Badge>
        ) : undefined
      }
    >
      {plan.name}
    </RowListItem>
  );
}

/**
 * The idea's plans (design-spec 6.1): their latest version and Go / No-Go; the archived
 * ones counted under them, listed once "Show" is pressed (P1 GET with them). A row opens
 * 20 once it is built.
 */
function PlansBlock({ home }: { home: ValidationHome }) {
  const { t } = useTranslation(["validation", "app"]);
  const [showsArchived, setShowsArchived] = useState(false);
  const archived = useQuery({
    ...archivedPlansQuery(home.idea.id),
    enabled: showsArchived,
  });
  const archivedPlans = (archived.data?.items ?? []).filter(
    (plan) => plan.archived,
  );
  return (
    <HubBlock
      title={t("validation:home.plans.title")}
      isBusy={showsArchived && archived.isPending}
    >
      {home.plans.length === 0 && home.archivedPlanCount === 0 ? (
        <Text tone="secondary" elementType="p">
          {/* Before any decision, as Decisions (6.1「作ったばかり」); after, d1-moon.html's. */}
          {home.decisions.length === 0
            ? t("validation:home.decisions.empty")
            : t("validation:home.plans.empty")}
        </Text>
      ) : (
        <>
          {(home.plans.length > 0 || archivedPlans.length > 0) && (
            <RowList aria-label={t("validation:home.plans.title")}>
              {home.plans.map((plan) => (
                <PlanRow key={plan.id} plan={plan} />
              ))}
              {showsArchived &&
                archivedPlans.map((plan) => (
                  <PlanRow key={plan.id} plan={plan} />
                ))}
            </RowList>
          )}
          {home.archivedPlanCount > 0 && !showsArchived && (
            <Text variant="body-sm" tone="secondary">
              {t("validation:home.plans.archived", {
                count: home.archivedPlanCount,
              })}
              {t("app:separator")}
              <Link onPress={() => setShowsArchived(true)}>
                {t("validation:home.plans.show")}
              </Link>
            </Text>
          )}
          {showsArchived && archived.isError && (
            <FailureState
              error={archived.error}
              onRetry={() => void archived.refetch()}
              headingLevel={3}
              size="S"
            />
          )}
        </>
      )}
    </HubBlock>
  );
}

/**
 * The title and what goes under it (design-spec 6.1, d1-moon.html .hero): the archived
 * notice with Restore, the latest decision and the stage, the name, the concept and who
 * proposed it, and the idea it was copied from.
 */
function Header({
  home,
  canWrite,
}: {
  home: ValidationHome;
  canWrite: boolean;
}) {
  const { t } = useTranslation(["validation", "common", "app"]);
  const { me, workspace } = useWorkspace();
  const actions = useIdeaActions();
  const { idea } = home;
  const latest = home.decisions[0];
  const status = [
    ...(latest === undefined || idea.latestDecision === null
      ? []
      : [
          t("validation:home.latestDecision", {
            date: formatDate(latest.recordedAt, { timeZone: me.timezone }),
          }),
        ]),
    t("validation:home.stage", { stage: t(`common:stage.${idea.stage}`) }),
  ].join(t("app:separator"));
  return (
    <>
      {idea.archived && (
        <InlineAlert title={t("validation:home.archived")}>
          {canWrite && (
            <Button
              variant="secondary"
              size="S"
              onPress={() => actions.restore(idea.id)}
            >
              {t("validation:home.restore")}
            </Button>
          )}
        </InlineAlert>
      )}
      <Flex gap="space-200" alignItems="center" wrap>
        <DecisionBadge decision={idea.latestDecision} />
        <Text variant="caption" tone="secondary">
          {status}
        </Text>
      </Flex>
      <Heading level={1} variant="heading-1-hub">
        {idea.name}
      </Heading>
      <Text tone="secondary">
        {`${idea.oneLineConcept} `}
        <Text tone="tertiary">
          {t("validation:home.by", { name: idea.proposer.displayName })}
        </Text>
      </Text>
      {idea.duplicatedFrom !== null && (
        <Flex>
          <Link href={ideaHref(workspace.id, idea.duplicatedFrom.id)}>
            {t("validation:home.duplicatedFrom", {
              name: idea.duplicatedFrom.name,
            })}
          </Link>
        </Flex>
      )}
    </>
  );
}

/**
 * The tools beside the title for the Owners and Members (design-spec 6.1「操作」): Edit
 * summary while the idea is not archived, and ⋯ with Duplicate, and Archive while it is
 * not. AI ▼, Record decision, Add plan and Update template join with their screens.
 */
function Tools({ home, onEdit }: { home: ValidationHome; onEdit: () => void }) {
  const { t } = useTranslation(["validation", "ideas"]);
  const actions = useIdeaActions();
  const { idea } = home;
  return (
    <>
      {!idea.archived && (
        <Button variant="secondary" isQuiet onPress={onEdit}>
          {t("validation:home.editSummary")}
        </Button>
      )}
      <ActionMenu
        aria-label={t("validation:home.more", { name: idea.name })}
        onAction={(key) => {
          if (key === "duplicate") actions.duplicate(idea);
          else if (key === "archive") actions.archive(idea.id);
        }}
      >
        <MenuItem id="duplicate">{t("ideas:action.duplicate")}</MenuItem>
        {!idea.archived && (
          <MenuItem id="archive">{t("ideas:action.archive")}</MenuItem>
        )}
      </ActionMenu>
    </>
  );
}

function ValidationHub({ home }: { home: ValidationHome }) {
  const { t } = useTranslation(["validation"]);
  const { workspace, role } = useWorkspace();
  const [isEditing, setEditing] = useState(false);
  const canWrite = role !== "viewer";
  const canEdit = canWrite && !home.idea.archived;
  const openEdit = canEdit ? () => setEditing(true) : undefined;
  const blocks: HubBlockSpec[] = [
    { id: "next", column: "main", content: <NextSteps home={home} /> },
    {
      id: "checks",
      column: "main",
      content: (
        <HubBlock
          title={t("validation:home.checks.title")}
          aside={t("validation:home.checks.legend")}
        >
          <CheckRows
            checks={home.checks}
            aria-label={t("validation:home.checks.title")}
          />
        </HubBlock>
      ),
    },
    { id: "fau", column: "main", content: <FauBlock fau={home.fau} /> },
    { id: "sections", column: "aside", content: <SectionsBlock home={home} /> },
    {
      id: "summary",
      column: "main",
      content: <SummaryBlock home={home} onEdit={openEdit} />,
    },
    {
      id: "decisions",
      column: "aside",
      content: <DecisionsBlock home={home} />,
    },
    { id: "plans", column: "aside", content: <PlansBlock home={home} /> },
  ];
  return (
    <>
      <HubPattern
        header={<Header home={home} canWrite={canWrite} />}
        actions={
          canWrite ? (
            <Tools home={home} onEdit={() => setEditing(true)} />
          ) : undefined
        }
        metrics={
          <KeyMetrics
            metrics={home.keyMetrics}
            currency={workspace.currency}
            variant="band"
            hasMarginWarning={home.economicsWarnings.includes(
              "margin_not_positive",
            )}
            aria-label={t("validation:home.keyNumbers")}
          />
        }
        blocks={blocks}
      />
      {isEditing && canEdit && (
        <ModalBoundary onClose={() => setEditing(false)}>
          <EditSummaryDialog home={home} onClose={() => setEditing(false)} />
        </ModalBoundary>
      )}
    </>
  );
}

/**
 * 13 Validation home's shape while it loads (design-spec 6.0.6・6.1「ローディング」): the
 * title, the key numbers, the checks and the sections. Drawn inside a `Skeleton`, its
 * words are bars.
 */
export function ValidationHomeSkeleton() {
  const { t } = useTranslation(["validation"]);
  const rows = (label: string) => (
    <RowList aria-label={label}>
      {[0, 1, 2, 3].map((row) => (
        <RowListItem key={row} end={t("validation:home.summary.empty")}>
          {label}
        </RowListItem>
      ))}
    </RowList>
  );
  return (
    <HubPattern
      header={
        <Heading level={1} variant="heading-1-hub">
          {t("validation:home.keyNumbers")}
        </Heading>
      }
      blocks={[
        {
          id: "checks",
          column: "main",
          content: (
            <HubBlock title={t("validation:home.checks.title")}>
              {rows(t("validation:home.checks.title"))}
            </HubBlock>
          ),
        },
        {
          id: "sections",
          column: "aside",
          content: (
            <HubBlock title={t("validation:home.sections.title")}>
              {rows(t("validation:home.sections.title"))}
            </HubBlock>
          ),
        },
      ]}
    />
  );
}

function ValidationHomeBody({ ideaId }: { ideaId: string }) {
  const { me, workspace } = useWorkspace();
  const query = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(query.isPending);
  if (query.data !== undefined) {
    // Another workspace's idea under this one's URL (SDD 4章): its role is not this one's.
    return query.data.idea.workspaceId === workspace.id ? (
      <ValidationHub home={query.data} />
    ) : (
      <NoAccessState dashboardHref={dashboardHref(me)} />
    );
  }
  if (query.isError) {
    return (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  if (isSlow) return <SlowLoadingState onRetry={() => void query.refetch()} />;
  return (
    <Skeleton isLoading>
      <ValidationHomeSkeleton />
    </Skeleton>
  );
}

/**
 * 13 Validation home (design-spec 6.1, d1-moon.html): pattern A with the key numbers
 * across the top. Next steps, Checks, F/A/U and Summary in the main column; Sections,
 * Decisions and Plans beside them; on a phone Next steps, Checks, F/A/U, Sections,
 * Summary, Decisions, Plans. The header's save state follows Edit summary.
 */
export function ValidationHomeScreen({ ideaId }: { ideaId: string }) {
  const { t } = useTranslation(["ideas"]);
  const { workspace } = useWorkspace();
  const { data } = useQuery(validationHomeQuery(ideaId));
  const name =
    data?.idea.workspaceId === workspace.id ? data.idea.name : undefined;
  useDocumentTitle(...(name === undefined ? [] : [name, workspace.name]));
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope={`idea:${ideaId}`}
      back={{ label: t("ideas:title"), href: ideasHref(workspace.id) }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {name !== undefined && <Breadcrumb>{name}</Breadcrumb>}
        </Breadcrumbs>
      }
    >
      <ValidationHomeBody ideaId={ideaId} />
    </WorkspaceFrame>
  );
}
