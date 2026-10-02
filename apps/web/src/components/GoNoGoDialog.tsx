import { formatDate } from "@moonx/i18n";
import {
  Button,
  Dialog,
  Flex,
  Form,
  InlineAlert,
  Radio,
  RadioGroup,
  RowList,
  RowListItem,
  Stack,
  Text,
  TextArea,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { goNoGoFormSchema } from "../forms/plan";
import { sendJson } from "../lib/api";
import { DECISION_METRIC_KEYS } from "../lib/decision";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { canEditIdeas, useWorkspaceCurrency, useWorkspaceRole } from "../lib/ideas";
import { useOverlay } from "../lib/overlay";
import {
  type GoNoGoContext,
  goNoGoContextQuery,
  planHomeQuery,
  usePlanRefresh,
} from "../lib/plans";
import { useMe } from "../lib/session";
import { toasts } from "../lib/toast";
import { decisionText } from "../screens/validation-home/decision-text";
import { MetricGrid } from "../screens/validation-home/KeyNumbers";
import { PlanSheetBoundary } from "./PlanSheet";

const VALUES = ["launch", "delay", "stop"] as const;
type Value = (typeof VALUES)[number];

const CONDITIONS = [
  { key: "launchIf", label: "planHome:goNoGo.launchIf" },
  { key: "delayIf", label: "planHome:goNoGo.delayIf" },
  { key: "stopIf", label: "planHome:goNoGo.stopIf" },
] as const;

function GoNoGoForm({
  planId,
  workspaceId,
  context,
}: {
  planId: string;
  workspaceId: string;
  context: GoNoGoContext;
}) {
  const { t } = useTranslation(["planHome", "validation", "app"]);
  const { timezone: timeZone } = useMe();
  const currency = useWorkspaceCurrency(workspaceId);
  const refresh = usePlanRefresh();
  const { closeModal, openModal } = useOverlay();
  const formId = useId();
  const { currentVersion } = context;

  const record = useMutation({
    mutationFn: (body: { value: Value; reason: string }) =>
      sendJson("POST", `/api/v1/plans/${planId}/go-no-go`, body),
    onSuccess: async () => {
      await refresh(planId);
      toasts.add({ title: t("planHome:goNoGo.recorded"), variant: "positive" });
      closeModal();
    },
  });

  const form = useForm({
    defaultValues: { value: "", reason: "" },
    validators: { onSubmit: validate(goNoGoFormSchema, t) },
    // The sheet shows the failure through `record.error` and keeps the input.
    onSubmit: ({ value }) =>
      record
        .mutateAsync({ value: value.value as Value, reason: value.reason.trim() })
        .catch(() => {}),
  });

  const history = context.history.filter((entry) => entry.kind === "go_no_go");

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={record.isPending}
      size="large"
      title={t("planHome:goNoGo.title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && closeModal()}
      actions={
        <>
          <Button variant="secondary" onPress={closeModal}>
            {t("app:cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="accent"
            isPending={record.isPending}
            pendingLabel={t("app:sending")}
          >
            {t("planHome:goNoGo.record")}
          </Button>
        </>
      }
    >
      <Stack gap="space-300">
        <Stack gap="space-100">
          <Text variant="label">{t("planHome:goNoGo.conditions")}</Text>
          <RowList aria-label={t("planHome:goNoGo.conditions")}>
            {CONDITIONS.map(({ key, label }) => {
              const text = context.conditions[key];
              return (
                <RowListItem key={key}>
                  <Stack gap="space-50">
                    <Text variant="caption" tone="secondary">
                      {t(label)}
                    </Text>
                    <Text tone={text ? undefined : "secondary"}>
                      {text ?? t("planHome:goNoGo.notWritten")}
                    </Text>
                  </Stack>
                </RowListItem>
              );
            })}
          </RowList>
        </Stack>
        <Stack gap="space-100">
          <Text variant="label">{t("planHome:goNoGo.keyNumbers")}</Text>
          <MetricGrid
            keys={DECISION_METRIC_KEYS}
            metrics={context.keyMetrics}
            currency={currency}
            warnings={[]}
            economicsPath={null}
          />
        </Stack>
        <Stack gap="space-100">
          <Text>
            {currentVersion
              ? t("planHome:goNoGo.currentVersion", { name: currentVersion.name })
              : t("planHome:goNoGo.noVersion")}
          </Text>
          {context.hasChangesSinceVersion ? (
            <InlineAlert
              variant="notice"
              role="note"
              heading={
                currentVersion
                  ? t("planHome:goNoGo.changes", { name: currentVersion.name })
                  : t("planHome:goNoGo.changesNoVersion")
              }
            >
              <Flex>
                <Button variant="secondary" onPress={() => openModal("save-version")}>
                  {t("planHome:goNoGo.saveFirst")}
                </Button>
              </Flex>
            </InlineAlert>
          ) : null}
        </Stack>
        <Form
          aria-label={t("planHome:goNoGo.title")}
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <Stack gap="space-200">
            {record.error ? (
              <InlineAlert variant="negative" heading={t("planHome:goNoGo.failed")}>
                {errorText(t, record.error)}
              </InlineAlert>
            ) : null}
            <form.Field name="value">
              {(field) => (
                <RadioGroup label={t("planHome:goNoGo.question")} isRequired {...fieldProps(field)}>
                  {VALUES.map((value) => (
                    <Radio key={value} value={value}>
                      {decisionText(t, value)}
                    </Radio>
                  ))}
                </RadioGroup>
              )}
            </form.Field>
            <form.Field name="reason">
              {(field) => (
                <TextArea label={t("planHome:goNoGo.reason")} isRequired {...fieldProps(field)} />
              )}
            </form.Field>
          </Stack>
        </Form>
        <Stack gap="space-100">
          <Text variant="label">{t("planHome:goNoGo.history")}</Text>
          {history.length === 0 ? (
            <Text tone="secondary">{t("planHome:goNoGo.historyEmpty")}</Text>
          ) : (
            <RowList aria-label={t("planHome:goNoGo.history")}>
              {history.map((entry) => (
                <RowListItem key={entry.id}>
                  <Stack gap="space-50">
                    <Text>
                      {t("planHome:goNoGo.historyLine", {
                        value: entry.value ? decisionText(t, entry.value as Value) : "",
                        date: formatDate(entry.recordedAt, timeZone),
                        who: entry.recordedBy.displayName,
                      })}
                    </Text>
                    {entry.versionName ? (
                      <Text variant="caption" tone="secondary">
                        {t("planHome:goNoGo.historyVersion", { version: entry.versionName })}
                      </Text>
                    ) : null}
                    {entry.reasonExcerpt ? (
                      <Text variant="body-sm">
                        {t("planHome:goNoGo.reasonLine", { reason: entry.reasonExcerpt })}
                      </Text>
                    ) : null}
                  </Stack>
                </RowListItem>
              ))}
            </RowList>
          )}
        </Stack>
      </Stack>
    </Dialog>
  );
}

/**
 * M4: record Launch, Delay or Stop for the plan (design-spec 6.12). The sheet reads P7 every time
 * it opens, so a version saved a moment ago shows as the current one. Only Owners and Members
 * may open it.
 */
export function GoNoGoDialog() {
  const { t } = useTranslation("planHome");
  const { workspaceId, planId } = useParams({ strict: false }) as {
    workspaceId?: string;
    planId?: string;
  };
  const role = useWorkspaceRole(workspaceId ?? "");
  const allowed = Boolean(workspaceId && planId) && canEditIdeas(role);
  const context = useQuery({ ...goNoGoContextQuery(planId ?? ""), enabled: allowed });
  const home = useQuery({ ...planHomeQuery(planId ?? ""), enabled: allowed });
  // A typed `?modal=go-no-go` must not open a control for an action the person cannot do: an
  // archived plan or idea is read only.
  if (!allowed || !workspaceId || !planId) return null;
  if (home.data && (home.data.archived || home.data.ideaArchived)) return null;
  return (
    <PlanSheetBoundary
      query={context}
      title={t("goNoGo.title")}
      loadFailed={t("goNoGo.loadFailed")}
      retryLabel={t("sheet.retry")}
    >
      {(data) => <GoNoGoForm planId={planId} workspaceId={workspaceId} context={data} />}
    </PlanSheetBoundary>
  );
}
