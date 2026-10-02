import { Button, Dialog, Form, InlineAlert, TextField } from "@moonx/ui-web";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { planNameFormSchema } from "../forms/plan";
import { sendJson } from "../lib/api";
import { isApiError } from "../lib/api-error";
import { errorText } from "../lib/error-text";
import { fieldProps, validate } from "../lib/form";
import { canEditIdeas, useIdeaSummary, useWorkspaceRole } from "../lib/ideas";
import { useGoTo } from "../lib/navigate";
import { useOverlay } from "../lib/overlay";
import {
  ideaPlansQuery,
  type PlanHome,
  planHomeKey,
  planPaths,
  usePlanRefresh,
} from "../lib/plans";
import { nextPlanName } from "../screens/plan-home/plan-names";
import { PlanSheetBoundary } from "./PlanSheet";

function CreatePlanForm({
  workspaceId,
  ideaId,
  defaultName,
}: {
  workspaceId: string;
  ideaId: string;
  defaultName: string;
}) {
  const { t } = useTranslation(["planHome", "app"]);
  const queryClient = useQueryClient();
  const refresh = usePlanRefresh();
  const goTo = useGoTo();
  const { closeModal } = useOverlay();
  const formId = useId();

  const create = useMutation({
    mutationFn: (name: string) =>
      sendJson<PlanHome>("POST", `/api/v1/ideas/${ideaId}/plans`, { name }),
    onSuccess: async (home) => {
      // The new plan's home opens next; it should not start with a skeleton.
      queryClient.setQueryData(planHomeKey(home.id), home);
      await refresh(home.id);
      goTo(planPaths(workspaceId, ideaId, home.id).home);
    },
  });

  const form = useForm({
    defaultValues: { name: defaultName },
    validators: { onSubmit: validate(planNameFormSchema, t) },
    // The sheet shows the failure through `create.error` and keeps the input.
    onSubmit: ({ value }) => create.mutateAsync(value.name.trim()).catch(() => {}),
  });

  const nameTaken = isApiError(create.error) && create.error.code === "NAME_TAKEN";

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={create.isPending}
      size="medium"
      title={t("planHome:create.title")}
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
                isPending={create.isPending}
                pendingLabel={t("app:saving")}
              >
                {t("planHome:create.create")}
              </Button>
            </>
          )}
        </form.Subscribe>
      }
    >
      <Form
        aria-label={t("planHome:create.title")}
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {create.error && !nameTaken ? (
          <InlineAlert variant="negative" heading={t("planHome:create.failed")}>
            {errorText(t, create.error)}
          </InlineAlert>
        ) : null}
        <form.Field name="name">
          {(field) => {
            const props = fieldProps(field);
            return (
              <TextField
                label={t("planHome:create.name")}
                description={t("planHome:create.help")}
                isRequired
                autoFocus
                {...props}
                isInvalid={props.isInvalid || nameTaken}
                errorMessage={
                  props.errorMessage ?? (nameTaken ? errorText(t, create.error) : undefined)
                }
                onChange={(value) => {
                  if (create.error) create.reset();
                  props.onChange(value);
                }}
              />
            );
          }}
        </form.Field>
      </Form>
    </Dialog>
  );
}

/**
 * M5: name a new plan draft (design-spec 6.12). The idea comes from the URL, so 13, 19's
 * confirmation and 20 all open it the same way (`?modal=create-plan`). The default name counts
 * archived plans as used, as the server does.
 */
export function CreatePlanDialog() {
  const { t } = useTranslation("planHome");
  const { workspaceId, ideaId } = useParams({ strict: false }) as {
    workspaceId?: string;
    ideaId?: string;
  };
  const role = useWorkspaceRole(workspaceId ?? "");
  const allowed = Boolean(workspaceId && ideaId) && canEditIdeas(role);
  const plans = useQuery({ ...ideaPlansQuery(ideaId ?? ""), enabled: allowed });
  const idea = useIdeaSummary(ideaId, allowed);
  // A typed `?modal=create-plan` must not open a control for an action the person cannot do:
  // M5 needs an idea that is not archived and whose latest decision is Proceed.
  if (!allowed || !workspaceId || !ideaId) return null;
  if (idea.data && (idea.data.archived || idea.data.latestDecision !== "proceed")) return null;
  return (
    <PlanSheetBoundary
      query={plans}
      title={t("create.title")}
      loadFailed={t("create.loadFailed")}
      retryLabel={t("sheet.retry")}
    >
      {({ items }) => (
        <CreatePlanForm
          workspaceId={workspaceId}
          ideaId={ideaId}
          defaultName={nextPlanName(
            t("create.namePrefix"),
            items.map((plan) => plan.name),
          )}
        />
      )}
    </PlanSheetBoundary>
  );
}
