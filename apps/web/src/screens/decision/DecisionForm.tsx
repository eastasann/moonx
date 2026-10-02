import { formatRelativeTime } from "@moonx/i18n";
import {
  AlertDialog,
  Button,
  Flex,
  FocusPattern,
  Form,
  InlineAlert,
  Radio,
  RadioGroup,
  Stack,
  Text,
  TextArea,
} from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { decisionFormSchema } from "../../forms/decision";
import { decisionContextQuery, readDecisionChanged, useRecordDecision } from "../../lib/decision";
import { errorText } from "../../lib/error-text";
import { fieldProps, validate } from "../../lib/form";
import { useGoTo } from "../../lib/navigate";
import { useMe } from "../../lib/session";
import { toasts } from "../../lib/toast";
import { decisionText } from "../validation-home/decision-text";

const VALUES = ["proceed", "hold", "drop"] as const;
type Value = (typeof VALUES)[number];
const NOTES = { proceed: "decision:note.proceed", drop: "decision:note.drop" } as const;

/**
 * The decision inputs of screen 19 and the actions under them (design-spec 6.5). The inputs do
 * not wait for the materials, but recording does: `basedOnDecisionId` is the last decision the
 * materials showed, and V19 refuses a decision made on top of a different one. `isIdeaLoaded` is
 * false until the idea is known, because an archived one cannot take a decision.
 */
export function DecisionForm({
  workspaceId,
  ideaId,
  header,
  evidence,
  isIdeaLoaded,
}: {
  workspaceId: string;
  ideaId: string;
  header: ReactNode;
  evidence: ReactNode;
  isIdeaLoaded: boolean;
}) {
  const { t } = useTranslation(["decision", "validation", "app"]);
  const goTo = useGoTo();
  const { timezone: timeZone } = useMe();
  const formId = useId();
  const context = useQuery(decisionContextQuery(ideaId)).data;
  const record = useRecordDecision(ideaId);
  const [askPlan, setAskPlan] = useState(false);
  // Set by "Record mine as well" for the one submit that follows it.
  const confirmNext = useRef(false);
  const homePath = `/w/${workspaceId}/ideas/${ideaId}`;

  const recorded = (value: Value, canCreatePlan: boolean) => {
    toasts.add({ title: t("decision:recorded"), variant: "positive" });
    if (value === "proceed" && canCreatePlan) setAskPlan(true);
    else goTo(homePath);
  };

  const form = useForm({
    defaultValues: { value: "", reason: "" },
    validators: { onSubmit: validate(decisionFormSchema, t) },
    onSubmit: ({ value }) => {
      if (!context || !isIdeaLoaded) return;
      const confirmNewer = confirmNext.current;
      confirmNext.current = false;
      const choice = value.value as Value;
      record.mutate(
        {
          value: choice,
          reason: value.reason.trim(),
          basedOnDecisionId: context.lastDecision?.id ?? null,
          ...(confirmNewer ? { confirmNewer: true } : {}),
        },
        { onSuccess: (result) => recorded(choice, result.canCreatePlan) },
      );
    },
  });

  const changed = readDecisionChanged(record.error);
  const failure = record.error && !changed ? record.error : null;
  const missing = context?.missingChecks.length ?? 0;

  const retry = () => {
    const body = record.variables;
    if (body) {
      record.mutate(body, { onSuccess: (result) => recorded(body.value, result.canCreatePlan) });
    }
  };
  const confirmNewerDecision = () => {
    confirmNext.current = true;
    void form.handleSubmit();
  };

  return (
    <>
      <FocusPattern
        header={header}
        evidence={evidence}
        actions={
          <Flex gap="space-100" justify="end">
            <Button variant="secondary" onPress={() => goTo(homePath)}>
              {t("app:cancel")}
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="accent"
              isDisabled={!context || !isIdeaLoaded}
              isPending={record.isPending}
              pendingLabel={t("app:sending")}
            >
              {t("validation:home.recordDecision")}
            </Button>
          </Flex>
        }
      >
        <Form
          aria-label={t("decision:title")}
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <Stack gap="space-200">
            <form.Field name="value">
              {(field) => (
                <Stack gap="space-100">
                  <RadioGroup label={t("decision:question")} isRequired {...fieldProps(field)}>
                    {VALUES.map((value) => (
                      <Radio key={value} value={value}>
                        {decisionText(t, value)}
                      </Radio>
                    ))}
                  </RadioGroup>
                  {field.state.value === "proceed" || field.state.value === "drop" ? (
                    <InlineAlert
                      variant="informative"
                      role="note"
                      heading={t(NOTES[field.state.value])}
                    />
                  ) : null}
                </Stack>
              )}
            </form.Field>
            <form.Field name="reason">
              {(field) => (
                <TextArea label={t("decision:reason")} isRequired {...fieldProps(field)} />
              )}
            </form.Field>
            {missing > 0 ? (
              <InlineAlert
                variant="notice"
                role="note"
                heading={t("decision:missing", { count: missing })}
              />
            ) : null}
            {changed ? (
              <InlineAlert
                variant="notice"
                heading={t("decision:conflict", {
                  who: changed.recordedBy.displayName,
                  decision: decisionText(t, changed.value),
                  when: formatRelativeTime(changed.recordedAt, new Date(), timeZone),
                })}
              >
                <Stack gap="space-100">
                  {changed.reasonExcerpt ? (
                    <Text>
                      {t("validation:home.decisions.reason", { reason: changed.reasonExcerpt })}
                    </Text>
                  ) : null}
                  <Flex>
                    <Button
                      variant="secondary"
                      isPending={record.isPending}
                      pendingLabel={t("app:sending")}
                      onPress={confirmNewerDecision}
                    >
                      {t("decision:recordMine")}
                    </Button>
                  </Flex>
                </Stack>
              </InlineAlert>
            ) : null}
            {failure ? (
              <InlineAlert variant="negative" heading={t("decision:failed")}>
                <Stack gap="space-100">
                  <Text>{errorText(t, failure)}</Text>
                  <Flex>
                    <Button
                      variant="secondary"
                      isPending={record.isPending}
                      pendingLabel={t("app:sending")}
                      onPress={retry}
                    >
                      {t("decision:retry")}
                    </Button>
                  </Flex>
                </Stack>
              </InlineAlert>
            ) : null}
          </Stack>
        </Form>
      </FocusPattern>
      <AlertDialog
        isOpen={askPlan}
        title={t("decision:plan.title")}
        primaryActionLabel={t("decision:plan.create")}
        cancelLabel={t("decision:plan.later")}
        onPrimaryAction={() => goTo(`${homePath}?modal=create-plan`)}
        onCancel={() => goTo(homePath)}
      >
        {t("decision:plan.body")}
      </AlertDialog>
    </>
  );
}
