import { Button, Dialog, Form, InlineAlert, TextField } from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { saveVersionFormSchema } from "../forms/plan";
import { sendJson } from "../lib/api";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { canEditIdeas, useWorkspaceRole } from "../lib/ideas";
import { useOverlay } from "../lib/overlay";
import { type PlanVersionSummary, planHomeQuery, usePlanRefresh } from "../lib/plans";
import { toasts } from "../lib/toast";
import { PlanSheetBoundary } from "./PlanSheet";

function SaveVersionForm({ planId, defaultName }: { planId: string; defaultName: string }) {
  const { t } = useTranslation(["planHome", "app"]);
  const refresh = usePlanRefresh();
  const { closeModal } = useOverlay();
  const formId = useId();

  const save = useMutation({
    mutationFn: (name: string) =>
      sendJson<PlanVersionSummary>("POST", `/api/v1/plans/${planId}/versions`, { name }),
    onSuccess: async () => {
      await refresh(planId);
      toasts.add({ title: t("planHome:saveVersion.saved"), variant: "positive" });
      closeModal();
    },
  });

  const form = useForm({
    defaultValues: { name: defaultName },
    validators: { onSubmit: validate(saveVersionFormSchema, t) },
    // The sheet shows the failure through `save.error` and keeps the input.
    onSubmit: ({ value }) => save.mutateAsync(value.name.trim()).catch(() => {}),
  });

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={save.isPending}
      size="medium"
      title={t("planHome:saveVersion.title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && closeModal()}
      actions={
        <form.Subscribe selector={(state) => state.values.name}>
          {(name) => (
            <>
              <Button variant="secondary" onPress={closeModal}>
                {t("app:cancel")}
              </Button>
              <Button
                type="submit"
                form={formId}
                variant="accent"
                isDisabled={!name.trim()}
                isPending={save.isPending}
                pendingLabel={t("app:saving")}
              >
                {t("planHome:saveVersion.save")}
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <Form
        aria-label={t("planHome:saveVersion.title")}
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {save.error ? (
          <InlineAlert variant="negative" heading={t("planHome:saveVersion.failed")}>
            {errorText(t, save.error)}
          </InlineAlert>
        ) : null}
        <form.Field name="name">
          {(field) => (
            <TextField
              label={t("planHome:saveVersion.name")}
              description={t("planHome:saveVersion.help")}
              isRequired
              autoFocus
              {...fieldProps(field)}
            />
          )}
        </form.Field>
      </Form>
    </Dialog>
  );
}

/**
 * M3: name and save a snapshot of the plan (design-spec 6.12). The default name is `v{n}`, `n`
 * one more than the versions the plan has; the home is read for that count.
 */
export function SaveVersionDialog() {
  const { t } = useTranslation("planHome");
  const { workspaceId, planId } = useParams({ strict: false }) as {
    workspaceId?: string;
    planId?: string;
  };
  const role = useWorkspaceRole(workspaceId ?? "");
  const allowed = Boolean(planId) && canEditIdeas(role);
  const home = useQuery({ ...planHomeQuery(planId ?? ""), enabled: allowed });
  // A typed `?modal=save-version` must not open a control for an action the person cannot do: an
  // archived plan or idea and a saved version are read only.
  if (!allowed || !planId) return null;
  if (home.data && (home.data.archived || home.data.ideaArchived || home.data.viewingVersion)) {
    return null;
  }
  return (
    <PlanSheetBoundary
      query={home}
      title={t("saveVersion.title")}
      loadFailed={t("saveVersion.loadFailed")}
      retryLabel={t("sheet.retry")}
    >
      {(plan) => (
        <SaveVersionForm
          planId={planId}
          defaultName={t("saveVersion.defaultName", { number: plan.versions.length + 1 })}
        />
      )}
    </PlanSheetBoundary>
  );
}
