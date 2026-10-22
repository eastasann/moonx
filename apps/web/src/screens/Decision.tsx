import { hasText } from "@moonx/domain";
import { formatDate, formatRelativeTime } from "@moonx/i18n";
import {
  type DecisionContext,
  type DecisionLogSummary,
  type DecisionValue,
  decisionLogSummarySchema,
  decisionValueSchema,
  reasonSchema,
  type ValidationHome,
} from "@moonx/schemas";
import {
  AlertDialog,
  Breadcrumb,
  Breadcrumbs,
  Button,
  DescriptionList,
  DescriptionListItem,
  Flex,
  FocusPattern,
  Heading,
  InlineAlert,
  Link,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Text,
  TextArea,
  ToastQueue,
  Well,
} from "@moonx/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  DecisionKeyNumbers,
  FauCounts,
  MissingCheckRows,
} from "../components/decisionParts";
import { rateLimitWords } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  reportOnce,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useWorkspace } from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import { rejectionReason } from "../lib/autosave";
import { inputIssueMessage } from "../lib/input-issues";
import { decisionsHref, ideaHref, ideasHref } from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  decisionContextQuery,
  ideaKey,
  validationHomeQuery,
  workspaceKey,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/** How long "Decision recorded" stays: the shortest 4.5 Toast allows. */
const TOAST_MS = 5000;

/**
 * What 19 shows to decide on (design-spec 6.5「表示内容」, s19-decision.html .well): the
 * Summary, the key numbers, the checks not done, the F/A/U of every item (Unknown and
 * Unclassified in amber) and the last decision.
 */
function Material({ context }: { context: DecisionContext }) {
  const { t } = useTranslation(["validation", "common"]);
  const { me, workspace } = useWorkspace();
  const { summary, keyMetrics, missingChecks, fau, lastDecision } = context;
  const empty = <Text tone="tertiary">{t("validation:rows.empty")}</Text>;
  const text = (value: string | null) => (hasText(value) ? value : empty);
  const items: [string, ReactNode][] = [
    ["concept", text(summary.oneLineConcept)],
    ["customer", text(summary.customer)],
    ["problem", text(summary.problem)],
    ["solution", text(summary.solution)],
    ["marketType", text(summary.marketType)],
    ["biggestOpportunity", text(summary.biggestOpportunity)],
    ["biggestUnknown", text(summary.biggestUnknown)],
    ["biggestRisk", text(summary.biggestRisk)],
  ];
  return (
    <Well
      density="spacious"
      role="region"
      aria-label={t("validation:decision.material")}
    >
      <Stack gap="space-300">
        <Stack gap="space-100">
          <Heading level={2} variant="label">
            {t("validation:decision.summary")}
          </Heading>
          <DescriptionList>
            {items.map(([key, value]) => (
              <DescriptionListItem
                key={key}
                label={t(`validation:decision.item.${key}` as never)}
              >
                {value}
              </DescriptionListItem>
            ))}
          </DescriptionList>
        </Stack>
        <Stack gap="space-100">
          <Heading level={2} variant="label">
            {t("validation:decision.keyNumbers")}
          </Heading>
          <DecisionKeyNumbers
            keyMetrics={keyMetrics}
            currency={workspace.currency}
            aria-label={t("validation:decision.keyNumbers")}
          />
        </Stack>
        <Stack gap="space-100">
          <Flex justifyContent="space-between" alignItems="baseline">
            <Heading level={2} variant="label">
              {t("validation:decision.checks")}
            </Heading>
            {missingChecks.length > 0 && (
              <Text variant="caption" tone="tertiary">
                {t("validation:decision.missing", {
                  count: missingChecks.length,
                })}
              </Text>
            )}
          </Flex>
          {missingChecks.length === 0 ? (
            <Text tone="secondary">{t("validation:decision.allDone")}</Text>
          ) : (
            <MissingCheckRows
              checks={missingChecks}
              aria-label={t("validation:decision.missingChecks")}
            />
          )}
        </Stack>
        <Stack gap="space-100">
          <Heading level={2} variant="label">
            {t("validation:decision.fau")}
          </Heading>
          <FauCounts fau={fau} />
          {lastDecision !== null && lastDecision.value !== null && (
            <Text variant="body-sm" tone="secondary">
              <Link
                href={decisionsHref(workspace.id, {
                  selected: lastDecision.id,
                })}
              >
                {t("validation:decision.last", {
                  value: t(`common:decision.${lastDecision.value}` as never),
                  date: formatDate(lastDecision.recordedAt, {
                    timeZone: me.timezone,
                  }),
                  name: lastDecision.recordedBy.displayName,
                })}
              </Link>
            </Text>
          )}
        </Stack>
      </Stack>
    </Well>
  );
}

/** The material's shape while it loads (design-spec 6.5: the fields come first). */
function MaterialSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <Skeleton isLoading>
      <Well density="spacious">
        <Stack gap="space-300">
          {[
            t("validation:decision.summary"),
            t("validation:decision.keyNumbers"),
            t("validation:decision.checks"),
          ].map((label) => (
            <Stack key={label} gap="space-100">
              <Heading level={2} variant="label">
                {label}
              </Heading>
              <Text>{t("validation:decision.material")}</Text>
            </Stack>
          ))}
        </Stack>
      </Well>
    </Skeleton>
  );
}

/**
 * "Couldn't record" with Retry (design-spec 6.5「記録の失敗」): the reason a refusal
 * names, the wait of a rate limit, or the Ref of an unexpected failure.
 */
function RecordFailure({
  error,
  onRetry,
  isRetryDisabled,
}: {
  error: unknown;
  onRetry: () => void;
  isRetryDisabled: boolean;
}) {
  const { t } = useTranslation(["validation", "app"]);
  const rateLimited = rateLimitWords(error);
  const reason = error instanceof ApiError ? rejectionReason(error) : null;
  const isTransient =
    error instanceof ApiError &&
    (error.status === null || error.code === "UPSTREAM_UNAVAILABLE");
  const isUnexpected = rateLimited === null && reason === null && !isTransient;
  const reference = useMemo(
    () =>
      !isUnexpected
        ? null
        : error instanceof ApiError
          ? error.requestId
          : reportOnce(error),
    [isUnexpected, error],
  );
  return (
    <InlineAlert variant="negative">
      <Flex gap="space-200" wrap alignItems="center">
        <Text>{t("validation:decision.couldNotRecord")}</Text>
        {rateLimited !== null && <Text tone="secondary">{rateLimited}</Text>}
        {reason !== null && (
          <Text tone="secondary">{t(`app:save.reason.${reason}`)}</Text>
        )}
        {reference !== null && (
          <Text variant="caption" tone="secondary">
            {t("app:state.ref", { ref: reference.slice(0, 8) })}
          </Text>
        )}
        <Button
          variant="secondary"
          size="S"
          onPress={onRetry}
          isDisabled={isRetryDisabled}
        >
          {t("app:state.retry")}
        </Button>
      </Flex>
    </InlineAlert>
  );
}

/** V19's refusal when another decision was recorded since 19 opened, with that one. */
function newerOf(error: unknown): DecisionLogSummary | null {
  if (!(error instanceof ApiError) || error.code !== "DECISION_CHANGED") {
    return null;
  }
  return decisionLogSummarySchema.safeParse(error.detail.latest).data ?? null;
}

function DecisionBody({ home }: { home: ValidationHome }) {
  const { t } = useTranslation(["validation", "common", "errors", "app"]);
  const { me, workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOnline = useIsOnline();
  const { idea } = home;
  const context = useQuery(decisionContextQuery(idea.id));
  const isSlow = useIsSlow(context.isPending);
  const [value, setValue] = useState<DecisionValue | null>(null);
  const [reason, setReason] = useState("");
  const [isChecked, setChecked] = useState(false);
  const [newer, setNewer] = useState<DecisionLogSummary | null>(null);
  const toHome = () => void navigate({ href: ideaHref(workspace.id, idea.id) });
  // Whether 19 is still open when a record settles, which may be later: a user who left
  // meanwhile is not taken back to 13.
  const isOpen = useRef(true);
  useEffect(() => {
    isOpen.current = true;
    return () => {
      isOpen.current = false;
    };
  }, []);

  const record = useMutation({
    mutationFn: ({
      chosen,
      confirmNewer,
    }: {
      chosen: DecisionValue;
      confirmNewer: boolean;
    }) =>
      unwrap(
        api()
          .api.v1.ideas({ ideaId: inPath(idea.id) })
          .decisions.post({
            value: chosen,
            reason,
            basedOnDecisionId: context.data?.lastDecision?.id ?? null,
            ...(confirmNewer ? { confirmNewer } : {}),
          }),
      ),
    onSuccess: () => {
      // 13's latest decision and history, the lists of ideas and the dashboard.
      void queryClient.invalidateQueries({ queryKey: ideaKey(idea.id) });
      void queryClient.invalidateQueries({
        queryKey: workspaceKey(workspace.id),
      });
      ToastQueue.neutral(t("validation:decision.recorded"), {
        timeout: TOAST_MS,
      });
      if (isOpen.current) toHome();
    },
    onError: (error) => {
      const latest = newerOf(error);
      if (latest !== null) setNewer(latest);
    },
  });

  const reasonIssue = reasonSchema.safeParse(reason).error?.issues[0];
  const valueError =
    isChecked && value === null ? t("errors:input.choice") : undefined;
  const reasonError =
    isChecked && reasonIssue !== undefined
      ? inputIssueMessage(reasonIssue)
      : undefined;
  const send = (confirmNewer: boolean) => {
    setChecked(true);
    if (value === null || reasonIssue !== undefined) return;
    record.mutate({ chosen: value, confirmNewer });
  };

  const material = context.isError ? (
    <FailureState
      error={context.error}
      onRetry={() => void context.refetch()}
      dashboardHref={dashboardHref(me)}
      headingLevel={2}
      size="S"
    />
  ) : context.data === undefined ? (
    isSlow ? (
      <SlowLoadingState
        onRetry={() => void context.refetch()}
        headingLevel={2}
        size="S"
      />
    ) : (
      <MaterialSkeleton />
    )
  ) : (
    <Material context={context.data} />
  );

  const header = (
    <Stack gap="space-75">
      <Text variant="caption" tone="secondary">
        {idea.name}
      </Text>
      <Heading level={1}>{t("validation:decision.title")}</Heading>
    </Stack>
  );

  if (idea.archived) {
    // Read only: the material shows, the fields do not (design-spec 6.5「状態」).
    return (
      <FocusPattern header={header}>
        <ArchivedIdeaAlert ideaId={idea.id} />
        {material}
      </FocusPattern>
    );
  }

  const missing = context.data?.missingChecks.length ?? 0;
  const failure =
    record.error !== null && newerOf(record.error) === null
      ? record.error
      : null;
  const isBusy = record.isPending;
  return (
    <>
      <FocusPattern
        header={header}
        actions={
          <>
            <Button variant="secondary" isQuiet onPress={toHome}>
              {t("validation:decision.cancel")}
            </Button>
            <Button
              variant="primary"
              onPress={() => send(false)}
              isPending={isBusy}
              isDisabled={context.data === undefined || !isOnline}
            >
              {t("validation:decision.record")}
            </Button>
          </>
        }
      >
        {material}
        <Stack gap="space-300">
          <RadioGroup
            label={t("validation:decision.question")}
            variant="cards"
            value={value ?? ""}
            onChange={(next) => setValue(decisionValueSchema.parse(next))}
            errorMessage={valueError}
            isRequired
            isDisabled={isBusy}
          >
            {decisionValueSchema.options.map((option) => (
              <Radio
                key={option}
                value={option}
                description={t(`validation:decision.choice.${option}`)}
              >
                {t(`common:decision.${option}`)}
              </Radio>
            ))}
          </RadioGroup>
          <Text variant="body-sm" tone="secondary">
            {value === "proceed" || value === "drop"
              ? t(`validation:decision.note.${value}`)
              : t("validation:decision.note.any")}
          </Text>
          <TextArea
            label={t("validation:decision.why")}
            isRequired
            isReason
            value={reason}
            onChange={setReason}
            errorMessage={reasonError}
            isReadOnly={isBusy}
            width="full"
          />
          {value !== null && missing > 0 && (
            <InlineAlert variant="notice">
              {t("validation:decision.missingNote", { count: missing })}
            </InlineAlert>
          )}
          {failure !== null && (
            <RecordFailure
              error={failure}
              onRetry={() => send(false)}
              isRetryDisabled={isBusy || !isOnline}
            />
          )}
        </Stack>
      </FocusPattern>
      {newer !== null && newer.value !== null && (
        <AlertDialog
          isOpen
          variant="confirmation"
          size="S"
          title={t("validation:decision.newer.title", {
            name: newer.recordedBy.displayName,
            value: t(`common:decision.${newer.value}` as never),
            when: formatRelativeTime(newer.recordedAt, {
              timeZone: me.timezone,
            }),
          })}
          primaryActionLabel={t("validation:decision.newer.record")}
          cancelLabel={t("validation:decision.newer.cancel")}
          onPrimaryAction={() => {
            setNewer(null);
            send(true);
          }}
          onCancel={() => {
            setNewer(null);
            record.reset();
            // The newer decision becomes the one this is based on, shown as the last.
            void context.refetch();
          }}
        >
          {t("validation:decision.newer.body")}
        </AlertDialog>
      )}
    </>
  );
}

/** 19's shape while its route loads (design-spec 6.0.6・6.5「ローディング」). */
export function DecisionSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <FocusPattern
      header={<Heading level={1}>{t("validation:decision.title")}</Heading>}
    >
      <MaterialSkeleton />
    </FocusPattern>
  );
}

/**
 * 19 Decision (design-spec 6.5, s19-decision.html): pattern B. What is known so far in a
 * Well (Summary, key numbers, the checks not done, F/A/U, the last decision), then
 * Proceed / Hold / Drop as cards and Why?; Record decision adds it to the decision log
 * and goes back to 13. Owners and Members only; read only for an archived idea.
 */
export function DecisionScreen({ ideaId }: { ideaId: string }) {
  const { t } = useTranslation(["ideas", "validation"]);
  const { me, workspace, role } = useWorkspace();
  const home = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(home.isPending);
  const data =
    home.data?.idea.workspaceId === workspace.id ? home.data : undefined;
  useDocumentTitle(
    ...(data === undefined
      ? []
      : [t("validation:decision.crumb"), workspace.name]),
  );

  let body: ReactNode;
  if (role === "viewer" || (home.data !== undefined && data === undefined)) {
    // A Viewer cannot open 19 (design-spec 6.5「状態」), nor another workspace's idea
    // under this one's URL (SDD 4章).
    body = <NoAccessState dashboardHref={dashboardHref(me)} />;
  } else if (data !== undefined) {
    body = <DecisionBody home={data} />;
  } else if (home.isError) {
    body = (
      <FailureState
        error={home.error}
        onRetry={() => void home.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  } else if (isSlow) {
    body = <SlowLoadingState onRetry={() => void home.refetch()} />;
  } else {
    body = (
      <Skeleton isLoading>
        <DecisionSkeleton />
      </Skeleton>
    );
  }
  return (
    <WorkspaceFrame
      current="ideas"
      back={{
        label: t("validation:questions.back"),
        href: ideaHref(workspace.id, ideaId),
      }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {data !== undefined && (
            <Breadcrumb href={ideaHref(workspace.id, ideaId)}>
              {data.idea.name}
            </Breadcrumb>
          )}
          <Breadcrumb>{t("validation:decision.crumb")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      {body}
    </WorkspaceFrame>
  );
}
